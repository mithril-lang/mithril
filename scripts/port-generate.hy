"Offline unrestricted patch generation from the pinned CLEF backbone; not its finite-choice head."
(import sys json pathlib argparse time)
(setv parser (argparse.ArgumentParser))
(.add-argument parser "--model-dir" :required True)
(.add-argument parser "--clef-adapter-root" :required True)
(setv args (.parse-args parser))
(sys.path.insert 0 (str (.resolve (pathlib.Path args.clef-adapter-root))))
(import local_support :as support)
(setv request (json.load sys.stdin) loaded (support.load-model args.model-dir)
      model (get (get loaded "loaded") 0) tokenizer (get (get loaded "loaded") 1))
(import mlx_lm [stream_generate])
(import mlx_lm.sample_utils [make_sampler])
(import outlines)
(import outlines.types [JsonSchema])
(setv schema {"type" "object" "additionalProperties" False "required" ["edits"]
              "properties" {"edits" {"type" "array" "minItems" 1 "maxItems" (get request "max-files")
                 "items" {"type" "object" "additionalProperties" False "required" ["path" "content"]
                          "properties" {"path" {"type" "string" "minLength" 1}
                                        "content" {"type" ["string" "null"]}}}}}}
      constrained (outlines.Generator (outlines.from-mlxlm model tokenizer) (JsonSchema schema)))
(setv system "You are Mithril's coding model. Implement the task by writing actual source code. Output schema: {\"edits\":[{\"path\":\"src/example.cljk\",\"content\":\"complete file text\"}]}. The edits field MUST be an array, never an object. Each item has only path and content. Return only that JSON object and stop. No markdown, comments, conversation turns or explanations outside JSON. Check balanced parentheses. Use the language and conventions of the supplied files. You may change multiple files and create new ones; null content deletes a file. Never include locked-inputs or .git files in edits. Do not return candidates or placeholders."
      system (+ system " CLJK uses prefix expressions: (< a b), never (a < b). Namespace forms must have balanced parentheses.")
      prompt (.apply-chat-template tokenizer [{"role" "system" "content" system}
        {"role" "user" "content" (json.dumps request :ensure-ascii False)}]
        :tokenize False :add-generation-prompt True :enable-thinking False))
(when (> (len (.encode tokenizer prompt)) 8192) (raise (ValueError "Generation context exceeds budget; no truncation")))
(setv started (time.perf-counter) chunks [] last None complete False)
(for [part (stream_generate model tokenizer prompt :max-tokens 1536 :sampler (make_sampler :temp 0)
             :logits-processors [constrained.logits_processor])]
  (.append chunks part.text)
  (setv last part)
  (try
    (setv parsed (json.loads (.join "" chunks)))
    (when (and (= (set (.keys parsed)) #{"edits"}) (isinstance (get parsed "edits") list))
      (setv complete True)
      (break))
    (except [e [ValueError AttributeError TypeError]] None)))
(print (json.dumps {"mechanism" "clef-backbone-autoregressive" "text" (.join "" chunks)
    "load_seconds" (get loaded "load_seconds") "generation_seconds" (- (time.perf-counter) started)
    "input_tokens" last.prompt_tokens "output_tokens" last.generation_tokens
    "generation_tokens_per_second" last.generation_tps "peak_memory_gb" last.peak_memory
    "finish_reason" (if complete "json-complete" last.finish_reason)} :ensure-ascii False))
