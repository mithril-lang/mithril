#!/usr/bin/env python3
"""Compile a Mithril module or OaK Program with Amu's native selfhost compiler."""

import argparse
import hashlib
import json
import os
import platform
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


MITHRIL_ROOT = Path(__file__).resolve().parents[1]
AMU_COMMIT = "8af3a09e547e38885ed30f7bf674ed79f9144fff"
AMU_SOURCE_UNITY_SHA256 = "4d941a063ca8098aee861ed0ddc3ef59db2e2bd44e9e93189e7b15438849f256"
AMU_NATIVE_COMPILER_SHA256 = "6b158aa8654706743462b8a730f189072ba05f364b00af28a3f6d23045add2eb"
AMU_BOOTSTRAP_CONTAINER_SHA256 = "e419658b76bce0e30febd9bd22270e23209ec03770b474ebc51bd25f8e36cd02"
AMU_REMOTE = "https://github.com/kotoba-lang/amu.git"


def run(argv, *, cwd, env=None, stdout=None, stderr=None):
    subprocess.run([str(item) for item in argv], cwd=cwd, env=env,
                   stdout=stdout, stderr=stderr, check=True)


def output(argv, *, cwd, env=None):
    return subprocess.run([str(item) for item in argv], cwd=cwd, env=env,
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                          text=True, check=True).stdout.strip()


def git(root, *args):
    return output(["git", "-C", root, *args], cwd=root)


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def clean_environment():
    return {key: value for key, value in os.environ.items()
            if not key.startswith("KEXE_")}


def require_amu_checkout(root):
    root = root.resolve(strict=True)
    if Path(git(root, "rev-parse", "--show-toplevel")).resolve() != root:
        raise SystemExit("--amu-root must be the Amu repository root")
    if git(root, "rev-parse", "HEAD") != AMU_COMMIT:
        raise SystemExit("Amu checkout must be pinned to " + AMU_COMMIT)
    remote = git(root, "remote", "get-url", "origin").removesuffix("/")
    if remote not in {AMU_REMOTE, "git@github.com:kotoba-lang/amu.git"}:
        raise SystemExit("Amu origin must be kotoba-lang/amu")
    if git(root, "status", "--porcelain"):
        raise SystemExit("Amu checkout must be clean")
    for required in ("scripts/seed/build-adopted.py", "seed/adoption-20261012.json"):
        if not (root / required).is_file():
            raise SystemExit("pinned Amu checkout is missing " + required)
    return root


def resolve_kbb(name):
    executable = shutil.which(name)
    if not executable:
        raise SystemExit("KBB launcher was not found: " + name)
    launcher = Path(executable).resolve(strict=True)
    engine = os.environ.get("KBB_ENGINE")
    if engine:
        engine_path = Path(engine).resolve(strict=True)
    else:
        engine_path = launcher.parent.parent.parent / "org-babashka-nbb/cli.js"
        if not engine_path.is_file():
            raise SystemExit("KBB_ENGINE must name the pinned org-babashka-nbb cli.js")
        engine_path = engine_path.resolve(strict=True)
    return Path(executable).resolve(strict=True), launcher, engine_path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--amu-root", required=True, type=Path)
    parser.add_argument("--source", required=True, type=Path,
                        help="a Mithril module or JSON-LD Program ending in .mith or .mithril")
    parser.add_argument("--output", required=True, type=Path,
                        help="new, empty build directory outside both checkouts")
    parser.add_argument("--selfhost-output", type=Path,
                        help="reuse a prior verified Amu selfhost build directory")
    parser.add_argument("--kbb", default="kbb",
                        help="KBB launcher used by the Mithril module frontend")
    parser.add_argument("--case", action="append", default=[],
                        help='optional JSON execution check: {"export":"name","args":[...],"expected":42}')
    args = parser.parse_args()

    if platform.system() != "Darwin" or platform.machine() != "arm64":
        raise SystemExit("the pinned Amu native selfhost bootstrap requires macOS arm64")
    amu_root = require_amu_checkout(args.amu_root)
    source = args.source.expanduser().resolve(strict=True)
    if source.suffix not in {".mith", ".mithril"} or not source.is_file():
        raise SystemExit("--source must be a .mith or .mithril module file")
    source_bytes = source.read_bytes()
    output_dir = args.output.expanduser()
    if not output_dir.is_absolute():
        raise SystemExit("--output must be an absolute path")
    if output_dir.is_symlink():
        raise SystemExit("--output must not be a symlink")
    output_dir = output_dir.resolve()
    if output_dir == MITHRIL_ROOT or MITHRIL_ROOT in output_dir.parents:
        raise SystemExit("--output must be outside the Mithril checkout")
    if output_dir == amu_root or amu_root in output_dir.parents:
        raise SystemExit("--output must be outside the Amu checkout")
    if output_dir.exists():
        raise SystemExit("--output must name a new build directory")
    if not output_dir.parent.is_dir():
        raise SystemExit("the parent of --output must already exist")

    selfhost_dir = output_dir
    if args.selfhost_output:
        selfhost_dir = args.selfhost_output.expanduser().resolve(strict=True)
        if (selfhost_dir == MITHRIL_ROOT or MITHRIL_ROOT in selfhost_dir.parents
                or selfhost_dir == amu_root or amu_root in selfhost_dir.parents):
            raise SystemExit("--selfhost-output must be outside both checkouts")
        if (output_dir == selfhost_dir or output_dir in selfhost_dir.parents
                or selfhost_dir in output_dir.parents):
            raise SystemExit("--output and --selfhost-output must be separate directories")

    kbb, kbb_launcher, sci_engine = resolve_kbb(args.kbb)
    node_command = shutil.which("node")
    if not node_command:
        raise SystemExit("Node.js is required to host the KBB/SCI Mithril frontend")
    node_executable = Path(node_command).resolve(strict=True)
    node_version = output([node_executable, "--version"], cwd=MITHRIL_ROOT)
    source_hash = hashlib.sha256(source_bytes).hexdigest()
    classpath = os.pathsep.join(str(MITHRIL_ROOT / name)
                                for name in ("src", "resources", "lib", "examples", "ontology"))

    # Lower before the multi-generation selfhost build so unsupported Mithril
    # host values fail before the expensive compiler bootstrap.
    with tempfile.TemporaryDirectory(prefix="mithril-amu-lower-", dir=output_dir.parent) as temp_name:
        temp = Path(temp_name)
        source_copy = temp / ("module" + source.suffix)
        lowered = temp / "module.kotoba"
        source_copy.write_bytes(source_bytes)
        lower_command = [kbb, "--backend", "sci", "--classpath", classpath,
                         MITHRIL_ROOT / "bin/mithril-amu.cljk", source_copy, lowered]
        lower_process = subprocess.run([str(item) for item in lower_command],
                                       cwd=MITHRIL_ROOT, env=clean_environment(),
                                       stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                       text=True)
        if lower_process.returncode:
            sys.stderr.write(lower_process.stderr or lower_process.stdout)
            raise SystemExit("Mithril native module admission failed")
        lower_result = json.loads(lower_process.stdout)
        lowered_bytes = lowered.read_bytes()

    if not args.selfhost_output:
        output_dir.parent.mkdir(parents=True, exist_ok=True)
        builder = amu_root / "scripts/seed/build-adopted.py"
        base_env = clean_environment()
        base_env["TMPDIR"] = str(output_dir.parent)
        run([sys.executable, builder, "--verify-only"], cwd=amu_root, env=base_env)
        run([sys.executable, builder, "--output", output_dir, "--generations", "3"],
            cwd=amu_root, env=base_env)

    build_report = json.loads((selfhost_dir / "report.json").read_text())
    generations = build_report.get("generations", [])
    if (build_report.get("status") != "PASS_ADOPTED_NATIVE_SELF_BUILD"
            or build_report.get("sourceUnitySHA256") != AMU_SOURCE_UNITY_SHA256
            or build_report.get("JVMNodeOrGraalFallback") is not False
            or build_report.get("CTrustedLoaderBuilt") is not True
            or len(generations) != 3
            or any(row.get("sha256") != AMU_NATIVE_COMPILER_SHA256 for row in generations)):
        raise SystemExit("Amu selfhost build does not match the pinned fixed point")

    selfhost_artifacts = selfhost_dir / "artifacts"
    artifacts = output_dir / "artifacts"
    if not output_dir.exists():
        output_dir.mkdir()
    if not artifacts.exists():
        artifacts.mkdir()
    elif not artifacts.is_dir():
        raise SystemExit("Mithril artifact output path is not a directory")
    loader_dir = selfhost_dir / "host"
    producer = selfhost_artifacts / "G3.bin"
    loader = loader_dir / "kexe-loader"
    if sha256(selfhost_artifacts / "G3.kseed") != AMU_BOOTSTRAP_CONTAINER_SHA256:
        raise SystemExit("Amu selfhost container does not match the pinned fixed point")
    producer_before = sha256(producer)
    loader_before = sha256(loader)
    if producer_before != AMU_NATIVE_COMPILER_SHA256:
        raise SystemExit("Amu G3 compiler does not match the pinned native image")

    source_copy = output_dir / ("module" + source.suffix)
    source_copy.write_bytes(source_bytes)
    module_source = artifacts / "mithril-module.kotoba"
    module_artifact = artifacts / "mithril-module.kseed"
    module_source.write_bytes(lowered_bytes)
    for path in (module_artifact, output_dir / "mithril-amu-build.json"):
        if path.exists():
            raise SystemExit("Mithril build output path already exists: " + path.name)

    env = clean_environment()
    env.update(
        KEXE_COMMAND="1",
        KEXE_CAP_RESOURCES_35=str(artifacts),
        KEXE_FUEL="off",
        KEXE_VECTORS="4194304",
        KEXE_VECTOR_ITEMS="134217728",
        KEXE_STRING_POOL="268435456",
        KEXE_PAIRS="16777216",
        KEXE_CPU_SECONDS="1800",
        KEXE_WALL_SECONDS="1800",
        TMPDIR=str(artifacts),
    )
    with (output_dir / "mithril-module.stdout").open("wb") as stdout, \
            (output_dir / "mithril-module.stderr").open("wb") as stderr:
        run([loader, producer, "0", "0", "aarch64", "35,37,38,39", "--",
             "compile", module_source.name, "--target", "aarch64-macos",
             "--output", module_artifact.name],
            cwd=artifacts, env=env, stdout=stdout, stderr=stderr)

    abi_by_export = {entry["name"]: entry for entry in lower_result.get("abi", [])}
    case_specs = []
    for encoded_case in args.case:
        try:
            case = json.loads(encoded_case)
        except json.JSONDecodeError as error:
            raise SystemExit("--case must be a JSON object: " + str(error))
        if (not isinstance(case, dict)
                or set(case) != {"export", "args", "expected"}
                or not isinstance(case["export"], str)
                or not isinstance(case["args"], list)
                or isinstance(case["expected"], bool)
                or not (isinstance(case["expected"], int) or isinstance(case["expected"], str))):
            raise SystemExit("--case requires export, args, and an integer or string expected value")
        if isinstance(case["expected"], int) and not -(1 << 63) <= case["expected"] < (1 << 63):
            raise SystemExit("integer execution results must be signed 64-bit values")
        if isinstance(case["expected"], str) and len(case["expected"]) > 1_048_576:
            raise SystemExit("string execution result exceeds the case budget")
        case_specs.append((case, False, False))

    # A JSON-LD Program becomes a string-returning native OaK module. Compile a
    # separate equality harness and execute it so the loader can verify the
    # native string result without treating a string handle as its contents.
    if lower_result.get("source-kind") == "mithril/program":
        transaction_edn = lower_result.get("transaction-edn")
        if not isinstance(transaction_edn, str):
            raise SystemExit("Mithril Program lowering did not return transaction EDN")
        case_specs.append(({"export": "transaction_edn", "args": [],
                            "expected": transaction_edn}, True, False))
        for case in lower_result.get("native-execution-cases", []):
            case_specs.append((case, False, True))

    case_results = []
    for index, (case, string_check, redact_args) in enumerate(case_specs):
        string_result_check = string_check or isinstance(case["expected"], str)
        abi = abi_by_export.get(case["export"])
        if abi is None:
            raise SystemExit("--case names an export not present in the Mithril module")
        if string_result_check:
            if (abi["returns"] != "string" or case["args"]
                    or len(abi["params"]) != 0):
                raise SystemExit("string execution checks currently require a zero-argument string export")
            case_symbol = "__mithril_case_" + str(index)
            case_source_path = artifacts / ("mithril-case-" + str(index) + ".kotoba")
            case_artifact = artifacts / ("mithril-case-" + str(index) + ".kseed")
            source_text = module_source.read_text()
            header_end = source_text.find("\n")
            header = source_text[:header_end + 1]
            export_start = header.find("(:export [")
            export_end = header.find("])", export_start)
            if header_end < 0 or export_start < 0 or export_end < 0:
                raise SystemExit("Mithril Kotoba output has an invalid export header")
            header = header[:export_end] + " " + case_symbol + header[export_end:]
            case_literal = json.dumps(case["expected"], ensure_ascii=True)
            case_source = (header + source_text[header_end + 1:]
                           + "\n(defn " + case_symbol + " [] :i64 (if (= ("
                           + abi["symbol"] + ") " + case_literal + ") 1 0))\n")
            if case_source_path.exists() or case_artifact.exists():
                raise SystemExit("Mithril string-check output path already exists")
            case_source_path.write_text(case_source)
            with (output_dir / ("mithril-case-" + str(index) + ".stdout")).open("wb") as stdout, \
                    (output_dir / ("mithril-case-" + str(index) + ".stderr")).open("wb") as stderr:
                run([loader, producer, "0", "0", "aarch64", "35,37,38,39", "--",
                     "compile", case_source_path.name, "--target", "aarch64-macos",
                     "--output", case_artifact.name],
                    cwd=artifacts, env=env, stdout=stdout, stderr=stderr)
            artifact_to_extract = case_artifact.name
            symbol_to_extract = case_symbol
            expected_value = "1"
        else:
            if len(case["args"]) != len(abi["params"]):
                raise SystemExit("--case args must match export arity")
            if abi["returns"] not in {"i64", "bool"}:
                raise SystemExit("execution checks currently accept only i64 or bool results")
            encoded_args = []
            for type_name, value in zip(abi["params"], case["args"]):
                if type_name == "string":
                    if not isinstance(value, str):
                        raise SystemExit("string execution arguments must be JSON strings")
                    encoded_args.append("s:" + value.encode("utf-8").hex())
                elif type_name in {"i64", "bool"}:
                    if type(value) is not int or not -(1 << 63) <= value < (1 << 63):
                        raise SystemExit("i64/bool execution arguments must be signed 64-bit integers")
                    if type_name == "bool" and value not in {0, 1}:
                        raise SystemExit("bool execution arguments must be 0 or 1")
                    encoded_args.append(str(value))
                else:
                    raise SystemExit("execution checks do not support parameter type " + type_name)
            if abi["returns"] == "bool" and case["expected"] not in {0, 1}:
                raise SystemExit("bool execution results must be 0 or 1")
            artifact_to_extract = module_artifact.name
            symbol_to_extract = abi["symbol"]
            expected_value = str(case["expected"])

        code_path = artifacts / ("mithril-case-" + str(index) + ".bin")
        if code_path.exists():
            raise SystemExit("Mithril execution case output path already exists")
        extraction = output(
            [loader, producer, "0", "0", "aarch64", "35,37,38,39", "--",
             "extract-native", artifact_to_extract, "--symbol", symbol_to_extract,
             "--output", code_path.name],
            cwd=artifacts, env=env)
        offset_match = re.search(r":offset\s+(\d+)", extraction)
        arity_match = re.search(r":arity\s+(\d+)", extraction)
        if not offset_match or not arity_match:
            raise SystemExit("Amu extract-native did not report the exported function ABI")
        offset = int(offset_match.group(1))
        arity = int(arity_match.group(1))
        expected_arity = 0 if string_result_check else len(case["args"])
        if arity != expected_arity:
            raise SystemExit("Amu export arity does not match Mithril's checked signature")
        call_env = dict(env)
        call_env.pop("KEXE_COMMAND", None)
        # Amu's native ABI represents :bool as the same 0/1 word as :i64;
        # the loader has no distinct bool result codec.
        call_env["KEXE_RESULT_TYPE"] = "i64"
        if case["args"] and not string_result_check:
            call_env["KEXE_ARG_TYPES"] = ",".join(abi["params"])
        call_args = [] if string_result_check else encoded_args
        actual = output([loader, code_path, offset, arity, "aarch64", "-", *call_args],
                        cwd=artifacts, env=call_env)
        if actual != expected_value:
            raise SystemExit("native Mithril call returned " + actual + ", expected "
                             + expected_value + " for " + case["export"])
        if string_result_check:
            case_results.append({"export": case["export"], "args": [],
                                 "expectedSHA256": hashlib.sha256(case["expected"].encode()).hexdigest(),
                                 "actual": "match", "codeSHA256": sha256(code_path),
                                 "caseModuleSHA256": sha256(case_artifact)})
        else:
            result = {**case, "actual": int(actual), "codeSHA256": sha256(code_path)}
            if redact_args:
                result["argsSHA256"] = [
                    hashlib.sha256(value.encode("utf-8")).hexdigest()
                    if isinstance(value, str) else value
                    for value in result.pop("args")
                ]
            case_results.append(result)

    if sha256(producer) != producer_before or sha256(loader) != loader_before:
        raise SystemExit("native compiler or trusted loader changed during compilation")
    if hashlib.sha256(source_bytes).hexdigest() != source_hash:
        raise SystemExit("Mithril source changed during compilation")
    if sha256(source_copy) != source_hash:
        raise SystemExit("Mithril source copy changed during compilation")

    frontend_files = [
        "bin/mithril-amu.cljk",
        "src/mithril/compiler.cljk",
        "src/mithril/form.cljk",
        "src/mithril/module.cljk",
        "src/mithril/module_lower.cljk",
        "deps.edn",
        "nbb.edn",
    ]
    receipt = {
        "schema": "mithril.amu-native-module-build.v1",
        "mithrilRepository": str(MITHRIL_ROOT),
        "mithrilCommit": git(MITHRIL_ROOT, "rev-parse", "HEAD"),
        "mithrilDirty": bool(git(MITHRIL_ROOT, "status", "--porcelain")),
        "frontendFiles": {path: sha256(MITHRIL_ROOT / path) for path in frontend_files},
        "amuRepository": AMU_REMOTE,
        "amuCommit": AMU_COMMIT,
        "amuSourceUnitySHA256": AMU_SOURCE_UNITY_SHA256,
        "amuNativeCompilerSHA256": AMU_NATIVE_COMPILER_SHA256,
        "amuBootstrapContainerSHA256": AMU_BOOTSTRAP_CONTAINER_SHA256,
        "selfhostBuildDirectory": str(selfhost_dir),
        "nativeCompilerSHA256": producer_before,
        "trustedLoaderSHA256": loader_before,
        "selfhostGenerations": 3,
        "kbbLauncherSHA256": sha256(kbb_launcher),
        "sciEngineSHA256": sha256(sci_engine),
        "nodeVersion": node_version,
        "nodeExecutableSHA256": sha256(node_executable),
        "source": source_copy.name,
        "sourceSHA256": source_hash,
        "sourceKind": lower_result.get("source-kind"),
        "nativeSourceFormat": lower_result.get("format"),
        "programFormat": lower_result.get("program-format"),
        "programGraphDigest": lower_result.get("graph-digest"),
        "transactionEdnSHA256": (hashlib.sha256(lower_result["transaction-edn"].encode()).hexdigest()
                                 if isinstance(lower_result.get("transaction-edn"), str) else None),
        "loweredKotobaSHA256": sha256(module_source),
        "target": "aarch64-macos",
        "artifact": "artifacts/mithril-module.kseed",
        "artifactSHA256": sha256(module_artifact),
        "executionChecks": case_results,
        "amuCompilerHost": "native Amu G3",
        "mithrilFrontendHost": "KBB/SCI on Node",
        "amuCompilerRuntimeFallback": False,
        "trustedCLoader": True,
    }
    receipt_path = output_dir / "mithril-amu-build.json"
    receipt_path.write_text(json.dumps(receipt, indent=2) + "\n")
    print(json.dumps(receipt, indent=2))


if __name__ == "__main__":
    main()
