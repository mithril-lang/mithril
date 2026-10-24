"Explicit verifier capability: native compile and KIR/JS/Wasm tests of the staged repository file."
(import sys pathlib subprocess os json)
(setv bundle (.resolve (pathlib.Path (get sys.argv 1))) source (get sys.argv 2)
      classpath (.join os.pathsep (lfor p (json.loads (.read-text (/ bundle "classpath.json"))) (str (/ bundle p))))
      runtime (pathlib.Path "runtime"))
(when (not (.exists runtime)) (.symlink-to runtime (/ bundle "amu/runtime") :target-is-directory True))
(for [[entry argv] [["x86_64_cli" ["compile" source "--target" "x86_64-linux" "--output" "program.kexe" "--jvm-free"]]
                   ["test_cli" ["test" source "--jvm-free" "--json" "--fuel" "10000"]]]]
  (setv r (subprocess.run (+ ["node" "--max-old-space-size=768" (str (/ bundle "engine/cli.js"))
                            "--classpath" classpath (str (/ bundle (+ "amu/src/kotoba/compiler/nbb/" entry ".cljk")))] argv)
            :text True :capture-output True :timeout 80))
  (print (json.dumps {"entry" entry "exit" r.returncode "stdout" r.stdout "stderr" r.stderr}))
  (when (!= r.returncode 0) (sys.exit r.returncode)))
