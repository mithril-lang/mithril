"Prepare an explicitly selected local coding model; no inference, tokens or remote custom code."
(import argparse pathlib hashlib json os)
(import huggingface_hub [HfApi snapshot_download])
(setv parser (argparse.ArgumentParser))
(.add-argument parser "--repo" :required True)
(.add-argument parser "--destination" :required True)
(.add-argument parser "--cache-dir" :required True)
(setv args (.parse-args parser) info (.model-info (HfApi :token False) args.repo :files-metadata True)
      destination (.resolve (pathlib.Path args.destination)))
(.mkdir destination :parents True :exist-ok False)
(setv fetched (snapshot_download :repo-id args.repo :revision info.sha :token False
                :cache-dir args.cache-dir :local-dir (str destination)
                :allow-patterns ["*.safetensors" "*.json" "*.txt" "*.model" "README.md" "LICENSE*"]
                :max-workers 4)
      files {})
(for [entry info.siblings]
  (setv file (/ destination entry.rfilename))
  (when (and (.is-file file) (not (.startswith entry.rfilename ".")))
    (with [f (.open file "rb")]
      (setv sha (.hexdigest (hashlib.file-digest f "sha256"))))
    (when (and entry.lfs (!= sha entry.lfs.sha256)) (raise (ValueError "LFS digest mismatch")))
    (setv (get files entry.rfilename) sha)))
(.write-text (/ destination "generation-manifest.json") (json.dumps
  {"format" "mithril.local-generator/v1" "repo" args.repo "revision" info.sha "files" files} :indent 2))
(print (json.dumps {"model" args.repo "revision" info.sha "files" (len files) "destination" (str destination)}))
