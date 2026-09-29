#!/usr/bin/env node
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// engine/sugar.ts
var fs11 = __toESM(require("node:fs"));
var path11 = __toESM(require("node:path"));

// engine/src/compilers/msvc.ts
var import_node_child_process = require("node:child_process");
var import_node_util = require("node:util");
var fs3 = __toESM(require("node:fs"));
var path3 = __toESM(require("node:path"));

// engine/src/utils/files.ts
var fs = __toESM(require("node:fs"));
var path = __toESM(require("node:path"));
var CPP_EXTENSIONS = /* @__PURE__ */ new Set([".cpp", ".cxx", ".cc", ".c++", ".cp"]);
var C_EXTENSIONS = /* @__PURE__ */ new Set([".c"]);
var ALL_SOURCE_EXTENSIONS = /* @__PURE__ */ new Set([...CPP_EXTENSIONS, ...C_EXTENSIONS]);
function isSourceFile(filePath) {
  return ALL_SOURCE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}
function getObjectExtension() {
  return process.platform === "win32" ? ".obj" : ".o";
}
function isSourceNewerThanObject(sourcePath, objectPath) {
  if (!fs.existsSync(objectPath)) return true;
  try {
    const srcStat = fs.statSync(sourcePath);
    const objStat = fs.statSync(objectPath);
    return srcStat.mtimeMs > objStat.mtimeMs;
  } catch {
    return true;
  }
}
function walkDirectory(dir) {
  const results = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "node_modules" && entry.name !== ".git" && entry.name !== "dist" && entry.name !== "build" && entry.name !== "target") {
          results.push(...walkDirectory(fullPath));
        }
      } else if (entry.isFile() && isSourceFile(entry.name)) {
        results.push(fullPath);
      }
    }
  } catch {
  }
  return results;
}
function resolveSources(sources, baseDir = process.cwd()) {
  const resolved = [];
  for (const src of sources) {
    if (src.includes("*")) {
      const isRecursive = src.includes("**");
      const rootDir = path.resolve(baseDir, src.split("*")[0] || ".");
      if (isRecursive) {
        const allFiles = walkDirectory(rootDir);
        resolved.push(...allFiles);
      } else {
        try {
          const searchDir = path.dirname(path.resolve(baseDir, src));
          const pattern = path.basename(src);
          const regex = new RegExp("^" + pattern.replace(/\./g, "\\.").replace(/\*/g, ".*") + "$", "i");
          if (fs.existsSync(searchDir)) {
            const files = fs.readdirSync(searchDir);
            for (const file of files) {
              if (regex.test(file) && isSourceFile(file)) {
                resolved.push(path.join(searchDir, file));
              }
            }
          }
        } catch {
        }
      }
    } else {
      const fullPath = path.isAbsolute(src) ? src : path.resolve(baseDir, src);
      if (fs.existsSync(fullPath)) {
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          resolved.push(...walkDirectory(fullPath));
        } else if (stat.isFile()) {
          resolved.push(fullPath);
        }
      } else {
        resolved.push(fullPath);
      }
    }
  }
  return [...new Set(resolved)];
}
function resolveOutputPath(output, sources, baseDir = process.cwd(), targetDir = "target") {
  const isWindows = process.platform === "win32";
  const ext = isWindows ? ".exe" : "";
  if (output) {
    let resolved = path.isAbsolute(output) ? output : path.resolve(baseDir, output);
    const hasKnownExt = /\.(exe|dll|so|lib|a|dylib)$/i.test(resolved);
    if (isWindows && !hasKnownExt) {
      resolved += ".exe";
    }
    return resolved;
  }
  const binDir = path.join(baseDir, targetDir, "bin");
  const firstSource = sources[0];
  if (firstSource) {
    const baseName = path.basename(firstSource, path.extname(firstSource));
    return path.join(binDir, `${baseName}${ext}`);
  }
  return path.join(binDir, `app${ext}`);
}
function resolveObjectDir(objectDir, baseDir = process.cwd(), targetDir = "target") {
  if (objectDir) {
    return path.isAbsolute(objectDir) ? objectDir : path.resolve(baseDir, objectDir);
  }
  return path.join(baseDir, targetDir, "object");
}
function cleanBuildArtifacts(outputExePath, objectDir) {
  const dir = path.dirname(outputExePath);
  const baseName = path.basename(outputExePath, path.extname(outputExePath));
  const artifactExtensions = [".exe", ".obj", ".o", ".pdb", ".ilk", ".idb", ".exp", ".lib", ".a", ".dll", ".so", ".dylib"];
  for (const ext of artifactExtensions) {
    const candidate = path.join(dir, `${baseName}${ext}`);
    if (fs.existsSync(candidate)) {
      try {
        fs.unlinkSync(candidate);
      } catch {
      }
    }
  }
  if (objectDir && fs.existsSync(objectDir)) {
    try {
      const files = fs.readdirSync(objectDir);
      for (const file of files) {
        if (file.endsWith(".obj") || file.endsWith(".o") || file.endsWith(".pdb") || file.endsWith(".pch")) {
          fs.unlinkSync(path.join(objectDir, file));
        }
      }
    } catch {
    }
  }
}

// engine/src/utils/folders.ts
var fs2 = __toESM(require("node:fs"));
var path2 = __toESM(require("node:path"));
var HEADER_EXTENSIONS = /* @__PURE__ */ new Set([".h", ".hpp", ".hxx", ".hh", ".inl"]);
var LIB_EXTENSIONS = /* @__PURE__ */ new Set([".lib", ".a"]);
function hasHeaderFiles(dir) {
  try {
    const entries = fs2.readdirSync(dir, { withFileTypes: true });
    return entries.some(
      (entry) => entry.isFile() && HEADER_EXTENSIONS.has(path2.extname(entry.name).toLowerCase())
    );
  } catch {
    return false;
  }
}
function findFilesByExtension(dir, extensions, recursive = true) {
  const results = [];
  try {
    const entries = fs2.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path2.join(dir, entry.name);
      if (entry.isDirectory() && recursive) {
        if (entry.name !== ".git" && entry.name !== "node_modules" && entry.name !== "dist" && entry.name !== "build" && entry.name !== "target") {
          results.push(...findFilesByExtension(fullPath, extensions, recursive));
        }
      } else if (entry.isFile() && extensions.has(path2.extname(entry.name).toLowerCase())) {
        results.push(fullPath);
      }
    }
  } catch {
  }
  return results;
}
function discoverProjectLayout(baseDir = process.cwd(), options) {
  const srcName = options?.srcDir || "src";
  const incName = options?.includeDir || "include";
  const vendorName = options?.vendorDir || "vendor";
  const autoDiscover = options?.autoDiscoverVendor !== false;
  const resolvedSrc = path2.resolve(baseDir, srcName);
  const resolvedInc = path2.resolve(baseDir, incName);
  const resolvedVendor = path2.resolve(baseDir, vendorName);
  const resolvedLib = path2.resolve(baseDir, "lib");
  const sourceFiles = [];
  const includeDirs = /* @__PURE__ */ new Set();
  const libDirs = /* @__PURE__ */ new Set();
  const libs = /* @__PURE__ */ new Set();
  const runtimeDlls = /* @__PURE__ */ new Set();
  const vendorBinDirs = /* @__PURE__ */ new Set();
  if (fs2.existsSync(resolvedSrc)) {
    sourceFiles.push(...walkDirectory(resolvedSrc));
    includeDirs.add(resolvedSrc);
  }
  if (fs2.existsSync(resolvedInc)) {
    includeDirs.add(resolvedInc);
  }
  if (fs2.existsSync(resolvedLib)) {
    libDirs.add(resolvedLib);
    const foundLibs = findFilesByExtension(resolvedLib, LIB_EXTENSIONS, true);
    for (const l of foundLibs) {
      libs.add(path2.basename(l));
    }
  }
  if (autoDiscover && fs2.existsSync(resolvedVendor)) {
    includeDirs.add(resolvedVendor);
    try {
      const vendorEntries = fs2.readdirSync(resolvedVendor, { withFileTypes: true });
      for (const entry of vendorEntries) {
        if (!entry.isDirectory()) continue;
        const vendorSubDir = path2.join(resolvedVendor, entry.name);
        const vendorConfigFile = path2.join(vendorSubDir, "cpp.json");
        let hasCustomManifest = false;
        if (fs2.existsSync(vendorConfigFile)) {
          try {
            const raw = fs2.readFileSync(vendorConfigFile, "utf8");
            const pkgConfig = JSON.parse(raw);
            hasCustomManifest = true;
            if (Array.isArray(pkgConfig.includeDirs) && pkgConfig.includeDirs.length > 0) {
              for (const inc of pkgConfig.includeDirs) {
                includeDirs.add(path2.resolve(vendorSubDir, inc));
              }
            } else {
              includeDirs.add(vendorSubDir);
            }
            if (Array.isArray(pkgConfig.libDirs)) {
              for (const ld of pkgConfig.libDirs) {
                libDirs.add(path2.resolve(vendorSubDir, ld));
              }
            }
            if (Array.isArray(pkgConfig.libs)) {
              for (const lb of pkgConfig.libs) {
                libs.add(lb);
              }
            }
            if (pkgConfig.binDir) {
              const fullBin = path2.resolve(vendorSubDir, pkgConfig.binDir);
              if (fs2.existsSync(fullBin)) {
                vendorBinDirs.add(fullBin);
              }
            }
          } catch {
            hasCustomManifest = false;
          }
        }
        if (!hasCustomManifest) {
          const subInc = path2.join(vendorSubDir, "include");
          if (fs2.existsSync(subInc)) {
            includeDirs.add(subInc);
          }
          if (hasHeaderFiles(vendorSubDir)) {
            includeDirs.add(vendorSubDir);
          }
          const subLib = path2.join(vendorSubDir, "lib");
          if (fs2.existsSync(subLib)) {
            libDirs.add(subLib);
            const x64Lib = path2.join(subLib, "x64");
            if (fs2.existsSync(x64Lib)) {
              libDirs.add(x64Lib);
            }
            const foundLibs = findFilesByExtension(subLib, LIB_EXTENSIONS, true);
            for (const l of foundLibs) {
              libs.add(path2.basename(l));
            }
          }
        }
        const subBin = path2.join(vendorSubDir, "bin");
        if (fs2.existsSync(subBin)) {
          vendorBinDirs.add(subBin);
          const dlls = findFilesByExtension(subBin, /* @__PURE__ */ new Set([".dll"]), true);
          for (const d of dlls) {
            runtimeDlls.add(d);
          }
        }
        const vendorLibDir = path2.join(vendorSubDir, "lib");
        if (fs2.existsSync(vendorLibDir)) {
          const dlls = findFilesByExtension(vendorLibDir, /* @__PURE__ */ new Set([".dll"]), true);
          if (dlls.length > 0) {
            vendorBinDirs.add(vendorLibDir);
          }
          for (const d of dlls) {
            runtimeDlls.add(d);
          }
        }
      }
    } catch {
    }
  }
  return {
    sourceFiles,
    includeDirs: Array.from(includeDirs),
    libDirs: Array.from(libDirs),
    libs: Array.from(libs),
    runtimeDlls: Array.from(runtimeDlls),
    vendorBinDirs: Array.from(vendorBinDirs)
  };
}
function copyRuntimeDlls(dllPaths, targetDir) {
  const copied = [];
  if (!fs2.existsSync(targetDir)) {
    fs2.mkdirSync(targetDir, { recursive: true });
  }
  for (const dllPath of dllPaths) {
    if (!fs2.existsSync(dllPath)) continue;
    const fileName = path2.basename(dllPath);
    const destPath = path2.join(targetDir, fileName);
    let needsCopy = true;
    if (fs2.existsSync(destPath)) {
      try {
        const srcStat = fs2.statSync(dllPath);
        const destStat = fs2.statSync(destPath);
        if (srcStat.size === destStat.size && srcStat.mtimeMs <= destStat.mtimeMs) {
          needsCopy = false;
        }
      } catch {
        needsCopy = true;
      }
    }
    if (needsCopy) {
      try {
        fs2.copyFileSync(dllPath, destPath);
        copied.push(fileName);
      } catch (err) {
        console.warn(`Warning: Could not copy DLL ${fileName} to ${targetDir}:`, err);
      }
    }
  }
  return copied;
}

// engine/src/compilers/msvc.ts
var execFileAsync = (0, import_node_util.promisify)(import_node_child_process.execFile);
var execAsync = (0, import_node_util.promisify)(import_node_child_process.exec);
var cachedMsvcEnv = null;
async function getMsvcEnvironment(vcvarsPath) {
  if (cachedMsvcEnv) return cachedMsvcEnv;
  if (!vcvarsPath) {
    cachedMsvcEnv = { ...process.env };
    return cachedMsvcEnv;
  }
  try {
    const { stdout } = await execAsync(`"${vcvarsPath}" >nul && set`, {
      windowsHide: true,
      maxBuffer: 20 * 1024 * 1024
    });
    const env = { ...process.env };
    for (const line of stdout.split(/\r?\n/)) {
      const idx = line.indexOf("=");
      if (idx > 0) {
        env[line.slice(0, idx)] = line.slice(idx + 1);
      }
    }
    cachedMsvcEnv = env;
    return env;
  } catch {
    console.warn("Warning: Failed to extract MSVC environment, falling back to process.env");
    cachedMsvcEnv = { ...process.env };
    return cachedMsvcEnv;
  }
}
function applyProfile(options) {
  const profile = options.profile;
  if (!profile) {
    return { optimization: options.optimization ?? "O2", debug: options.debug ?? false };
  }
  switch (profile) {
    case "debug":
      return { optimization: "O0", debug: true };
    case "release":
      return { optimization: "O2", debug: false };
    case "relwithdebinfo":
      return { optimization: "O2", debug: true };
    case "minsizerel":
      return { optimization: "Os", debug: false };
    default:
      return { optimization: options.optimization ?? "O2", debug: options.debug ?? false };
  }
}
var MsvcCompilerDriver = class {
  info;
  constructor(info) {
    this.info = info;
  }
  async compile(options) {
    const startTime = Date.now();
    const workingDir = options.workingDir || process.cwd();
    const resolvedSources = resolveSources(options.sources, workingDir);
    if (resolvedSources.length === 0) {
      throw new Error(`No C++ source files found matching: ${options.sources.join(", ")}`);
    }
    for (const src of resolvedSources) {
      if (!fs3.existsSync(src)) {
        throw new Error(`Source file not found: ${src}`);
      }
    }
    const outputExe = resolveOutputPath(options.output, resolvedSources, workingDir, options.targetDir);
    const binDir = path3.dirname(outputExe);
    const objDir = resolveObjectDir(options.objectDir, workingDir, options.targetDir);
    if (!fs3.existsSync(binDir)) fs3.mkdirSync(binDir, { recursive: true });
    if (!fs3.existsSync(objDir)) fs3.mkdirSync(objDir, { recursive: true });
    if (options.clean) cleanBuildArtifacts(outputExe, objDir);
    const profile = applyProfile(options);
    const isDynamic = options.type === "dynamic" || options.type === "shared" || options.type === "dll" || outputExe.toLowerCase().endsWith(".dll");
    const isStatic = options.type === "static" || options.type === "lib" || outputExe.toLowerCase().endsWith(".lib");
    const isHeaderOnly = options.type === "header-only";
    if (isHeaderOnly) {
      const layout = discoverProjectLayout(workingDir, {
        srcDir: options.srcDir,
        includeDir: options.includeDir,
        vendorDir: options.vendorDir,
        autoDiscoverVendor: options.autoDiscoverVendor
      });
      return {
        success: true,
        executablePath: outputExe,
        durationMs: Date.now() - startTime,
        compiler: this.info,
        stdout: "",
        stderr: "",
        commandExecuted: "(header-only: no compilation needed)",
        copiedDlls: [],
        vendorBinDirs: layout.vendorBinDirs,
        projectInfo: { name: options.name, version: options.version, type: options.type }
      };
    }
    const baseArgs = ["/nologo", "/EHsc", "/utf-8", "/Zc:__cplusplus"];
    if (isDynamic) baseArgs.push("/LD");
    else if (isStatic) baseArgs.push("/c");
    if (options.parallel !== false) {
      const jobs = options.jobs ?? (process.env.NUMBER_OF_PROCESSORS ? parseInt(process.env.NUMBER_OF_PROCESSORS) : 4);
      if (jobs > 1) baseArgs.push(`/MP${jobs}`);
    }
    switch (options.std) {
      case "c++11":
        baseArgs.push("/std:c++14");
        break;
      case "c++14":
        baseArgs.push("/std:c++14");
        break;
      case "c++17":
        baseArgs.push("/std:c++17");
        break;
      case "c++20":
        baseArgs.push("/std:c++20");
        break;
      case "c++23":
      case "c++26":
      case "latest":
        baseArgs.push("/std:c++latest");
        break;
      default:
        baseArgs.push("/std:c++20");
        break;
    }
    if (options.cStandard) {
      switch (options.cStandard) {
        case "c11":
          baseArgs.push("/std:c11");
          break;
        case "c17":
          baseArgs.push("/std:c17");
          break;
        case "c23":
        case "c_latest":
          baseArgs.push("/std:clatest");
          break;
      }
    }
    switch (profile.optimization) {
      case "O0":
        baseArgs.push("/Od");
        break;
      case "O1":
      case "Os":
      case "Oz":
        baseArgs.push("/O1");
        break;
      case "O2":
        baseArgs.push("/O2");
        break;
      case "O3":
        baseArgs.push("/Ox");
        break;
      default:
        baseArgs.push("/O2");
        break;
    }
    const linkerFlags = [];
    if (profile.debug) {
      baseArgs.push("/Zi");
      linkerFlags.push("/DEBUG");
    }
    switch (options.warnings) {
      case "none":
        baseArgs.push("/w");
        break;
      case "all":
        baseArgs.push("/W4");
        break;
      default:
        baseArgs.push("/W3");
        break;
    }
    if (options.warningsAsErrors) baseArgs.push("/WX");
    if (options.includeDirs) {
      for (const inc of options.includeDirs) {
        baseArgs.push(`/I${path3.isAbsolute(inc) ? inc : path3.resolve(workingDir, inc)}`);
      }
    }
    if (options.defines) {
      for (const def of options.defines) baseArgs.push(`/D${def}`);
    }
    if (options.lto) {
      baseArgs.push("/GL");
      linkerFlags.push("/LTCG");
    }
    if (options.sanitizers && options.sanitizers.length > 0 && options.sanitizers.includes("address")) {
      baseArgs.push("/fsanitize=address");
    }
    if (options.libDirs) {
      for (const libDir of options.libDirs) {
        linkerFlags.push(`/LIBPATH:${path3.isAbsolute(libDir) ? libDir : path3.resolve(workingDir, libDir)}`);
      }
    }
    if (options.libs) {
      for (const lib of options.libs) {
        linkerFlags.push(lib.endsWith(".lib") ? lib : `${lib}.lib`);
      }
    }
    if (isDynamic && options.libDir) {
      const fullLibDir = path3.isAbsolute(options.libDir) ? options.libDir : path3.resolve(workingDir, options.libDir);
      if (!fs3.existsSync(fullLibDir)) fs3.mkdirSync(fullLibDir, { recursive: true });
      const baseName = path3.basename(outputExe, path3.extname(outputExe));
      linkerFlags.push(`/IMPLIB:${path3.join(fullLibDir, `${baseName}.lib`)}`);
    }
    const formattedObjDir = path3.isAbsolute(objDir) ? objDir : path3.resolve(workingDir, objDir);
    if (profile.debug) {
      baseArgs.push(`/Fd:${formattedObjDir}${path3.sep}`);
    }
    const sourcesToCompile = [];
    for (const src of resolvedSources) {
      const objPath = path3.join(formattedObjDir, path3.basename(src, path3.extname(src)) + ".obj");
      if (options.clean || isSourceNewerThanObject(src, objPath)) {
        sourcesToCompile.push(src);
      }
    }
    if (sourcesToCompile.length === 0 && !isDynamic && !isStatic) {
      const layout = discoverProjectLayout(workingDir, {
        srcDir: options.srcDir,
        includeDir: options.includeDir,
        vendorDir: options.vendorDir,
        autoDiscoverVendor: options.autoDiscoverVendor
      });
      return {
        success: true,
        executablePath: outputExe,
        durationMs: Date.now() - startTime,
        compiler: this.info,
        stdout: "",
        stderr: "",
        commandExecuted: "(incremental: all objects up to date)",
        copiedDlls: [],
        vendorBinDirs: layout.vendorBinDirs,
        projectInfo: { name: options.name, version: options.version, type: options.type }
      };
    }
    const msvcEnv = await getMsvcEnvironment(this.info.vcvarsPath);
    let finalStdout = "";
    let finalStderr = "";
    const commandParts = [];
    try {
      let pchHeader = "";
      let pchFile = "";
      if (options.pch) {
        pchHeader = path3.isAbsolute(options.pch) ? options.pch : path3.resolve(workingDir, options.pch);
        if (fs3.existsSync(pchHeader)) {
          pchFile = path3.join(formattedObjDir, "vc_pch.pch");
        } else {
          pchHeader = "";
        }
      }
      if (isStatic) {
        for (const src of sourcesToCompile) {
          const compileArgs = [...baseArgs, "/c"];
          if (pchHeader) {
            compileArgs.push(`/Yu${pchHeader}`, `/Fp${pchFile}`);
          }
          compileArgs.push(`/Fo:${path3.join(formattedObjDir, path3.basename(src, path3.extname(src)) + ".obj")}`, src);
          commandParts.push(`${this.info.executable} ${compileArgs.join(" ")}`);
          const { stdout, stderr } = await execFileAsync(this.info.executable, compileArgs, {
            cwd: workingDir,
            env: msvcEnv,
            windowsHide: true,
            maxBuffer: 20 * 1024 * 1024
          });
          if (stdout.trim()) finalStdout += stdout.trim() + "\n";
          if (stderr.trim()) finalStderr += stderr.trim() + "\n";
        }
        const objFiles = fs3.readdirSync(formattedObjDir).filter((f) => f.endsWith(".obj")).map((f) => path3.join(formattedObjDir, f));
        if (objFiles.length > 0) {
          const libTool = path3.join(path3.dirname(this.info.executable), "lib.exe");
          const libTargetDir = path3.dirname(outputExe);
          if (!fs3.existsSync(libTargetDir)) fs3.mkdirSync(libTargetDir, { recursive: true });
          const libArgs = ["/nologo", ...objFiles, `/OUT:${outputExe}`];
          commandParts.push(`lib ${libArgs.join(" ")}`);
          const libResult = await execFileAsync(
            fs3.existsSync(libTool) ? libTool : "lib.exe",
            libArgs,
            { cwd: workingDir, env: msvcEnv, windowsHide: true, maxBuffer: 20 * 1024 * 1024 }
          );
          if (libResult.stdout?.trim()) finalStdout += libResult.stdout.trim() + "\n";
          if (libResult.stderr?.trim()) finalStderr += libResult.stderr.trim() + "\n";
        }
      } else {
        const compileArgs = [...baseArgs];
        compileArgs.push(`/Fe:${outputExe}`);
        compileArgs.push(`/Fo:${formattedObjDir}${path3.sep}`);
        if (pchHeader && sourcesToCompile.length > 0) {
          const pchArgs = [...compileArgs, `/Yc${pchHeader}`, `/Fp${pchFile}`, sourcesToCompile[0]];
          commandParts.push(`${this.info.executable} ${pchArgs.join(" ")}`);
          const { stdout: s1, stderr: e1 } = await execFileAsync(this.info.executable, pchArgs, {
            cwd: workingDir,
            env: msvcEnv,
            windowsHide: true,
            maxBuffer: 20 * 1024 * 1024
          });
          if (s1.trim()) finalStdout += s1.trim() + "\n";
          if (e1.trim()) finalStderr += e1.trim() + "\n";
          if (sourcesToCompile.length > 1) {
            const useArgs = [...compileArgs, `/Yu${pchHeader}`, `/Fp${pchFile}`, ...sourcesToCompile.slice(1)];
            useArgs.push("/link", ...linkerFlags);
            commandParts.push(`${this.info.executable} ${useArgs.join(" ")}`);
            const { stdout: s2, stderr: e2 } = await execFileAsync(this.info.executable, useArgs, {
              cwd: workingDir,
              env: msvcEnv,
              windowsHide: true,
              maxBuffer: 20 * 1024 * 1024
            });
            if (s2.trim()) finalStdout += s2.trim() + "\n";
            if (e2.trim()) finalStderr += e2.trim() + "\n";
          }
        } else {
          compileArgs.push(...sourcesToCompile);
          compileArgs.push("/link", ...linkerFlags);
          commandParts.push(`${this.info.executable} ${compileArgs.join(" ")}`);
          const { stdout, stderr } = await execFileAsync(this.info.executable, compileArgs, {
            cwd: workingDir,
            env: msvcEnv,
            windowsHide: true,
            maxBuffer: 20 * 1024 * 1024
          });
          if (stdout.trim()) finalStdout += stdout.trim() + "\n";
          if (stderr.trim()) finalStderr += stderr.trim() + "\n";
        }
      }
      const layout = discoverProjectLayout(workingDir, {
        srcDir: options.srcDir,
        includeDir: options.includeDir,
        vendorDir: options.vendorDir,
        autoDiscoverVendor: options.autoDiscoverVendor
      });
      let copiedDlls = [];
      if (options.copyDlls === true && layout.runtimeDlls.length > 0) {
        copiedDlls = copyRuntimeDlls(layout.runtimeDlls, binDir);
      }
      return {
        success: true,
        executablePath: outputExe,
        durationMs: Date.now() - startTime,
        compiler: this.info,
        stdout: finalStdout.trim(),
        stderr: finalStderr.trim(),
        commandExecuted: commandParts.join(" && "),
        copiedDlls,
        vendorBinDirs: layout.vendorBinDirs,
        projectInfo: { name: options.name, version: options.version, type: options.type }
      };
    } catch (err) {
      return {
        success: false,
        executablePath: outputExe,
        durationMs: Date.now() - startTime,
        compiler: this.info,
        stdout: (err.stdout || "").trim(),
        stderr: (err.stderr || err.message || "").trim(),
        commandExecuted: commandParts.join(" && ")
      };
    }
  }
};

// engine/src/compilers/gcc-clang.ts
var import_node_child_process2 = require("node:child_process");
var import_node_util2 = require("node:util");
var fs4 = __toESM(require("node:fs"));
var path4 = __toESM(require("node:path"));
var execFileAsync2 = (0, import_node_util2.promisify)(import_node_child_process2.execFile);
function applyProfile2(options) {
  const profile = options.profile;
  if (!profile) {
    return {
      optimization: options.optimization ?? "O2",
      debug: options.debug ?? false
    };
  }
  switch (profile) {
    case "debug":
      return { optimization: "O0", debug: true };
    case "release":
      return { optimization: "O2", debug: false };
    case "relwithdebinfo":
      return { optimization: "O2", debug: true };
    case "minsizerel":
      return { optimization: "Os", debug: false };
    default:
      return {
        optimization: options.optimization ?? "O2",
        debug: options.debug ?? false
      };
  }
}
var GccClangCompilerDriver = class {
  info;
  constructor(info) {
    this.info = info;
  }
  async compile(options) {
    const startTime = Date.now();
    const workingDir = options.workingDir || process.cwd();
    const resolvedSources = resolveSources(options.sources, workingDir);
    if (resolvedSources.length === 0) {
      throw new Error(`No source files found matching: ${options.sources.join(", ")}`);
    }
    for (const src of resolvedSources) {
      if (!fs4.existsSync(src)) {
        throw new Error(`Source file not found: ${src}`);
      }
    }
    const outputExe = resolveOutputPath(options.output, resolvedSources, workingDir, options.targetDir);
    const binDir = path4.dirname(outputExe);
    const objDir = resolveObjectDir(options.objectDir, workingDir, options.targetDir);
    if (!fs4.existsSync(binDir)) {
      fs4.mkdirSync(binDir, { recursive: true });
    }
    if (!fs4.existsSync(objDir)) {
      fs4.mkdirSync(objDir, { recursive: true });
    }
    if (options.clean) {
      cleanBuildArtifacts(outputExe, objDir);
    }
    const profile = applyProfile2(options);
    const isDynamic = options.type === "dynamic" || options.type === "shared" || options.type === "dll" || outputExe.toLowerCase().endsWith(".dll") || outputExe.toLowerCase().endsWith(".so");
    const isStatic = options.type === "static" || options.type === "lib" || outputExe.toLowerCase().endsWith(".a") || outputExe.toLowerCase().endsWith(".lib");
    const isHeaderOnly = options.type === "header-only";
    if (isHeaderOnly) {
      const layout = discoverProjectLayout(workingDir, {
        srcDir: options.srcDir,
        includeDir: options.includeDir,
        vendorDir: options.vendorDir,
        autoDiscoverVendor: options.autoDiscoverVendor
      });
      return {
        success: true,
        executablePath: outputExe,
        durationMs: Date.now() - startTime,
        compiler: this.info,
        stdout: "",
        stderr: "",
        commandExecuted: "(header-only: no compilation needed)",
        copiedDlls: [],
        vendorBinDirs: layout.vendorBinDirs,
        projectInfo: { name: options.name, version: options.version, type: options.type }
      };
    }
    const sharedFlags = [];
    switch (options.std) {
      case "c++11":
        sharedFlags.push("-std=c++11");
        break;
      case "c++14":
        sharedFlags.push("-std=c++14");
        break;
      case "c++17":
        sharedFlags.push("-std=c++17");
        break;
      case "c++20":
        sharedFlags.push("-std=c++20");
        break;
      case "c++23":
        sharedFlags.push("-std=c++23");
        break;
      case "c++26":
      case "latest":
        sharedFlags.push("-std=c++2c");
        break;
      default:
        sharedFlags.push("-std=c++20");
        break;
    }
    if (options.cStandard) {
      switch (options.cStandard) {
        case "c11":
          sharedFlags.push("-std=c11");
          break;
        case "c17":
          sharedFlags.push("-std=c17");
          break;
        case "c23":
          sharedFlags.push("-std=c23");
          break;
        case "c_latest":
          sharedFlags.push("-std=c2x");
          break;
      }
    }
    switch (profile.optimization) {
      case "O0":
        sharedFlags.push("-O0");
        break;
      case "O1":
        sharedFlags.push("-O1");
        break;
      case "O2":
        sharedFlags.push("-O2");
        break;
      case "O3":
        sharedFlags.push("-O3");
        break;
      case "Os":
        sharedFlags.push("-Os");
        break;
      case "Oz":
        sharedFlags.push("-Oz");
        break;
      default:
        sharedFlags.push("-O2");
        break;
    }
    if (profile.debug) sharedFlags.push("-g");
    switch (options.warnings) {
      case "none":
        sharedFlags.push("-w");
        break;
      case "all":
        sharedFlags.push("-Wall", "-Wextra");
        break;
      default:
        sharedFlags.push("-Wall");
        break;
    }
    if (options.warningsAsErrors) sharedFlags.push("-Werror");
    if (options.includeDirs) {
      for (const inc of options.includeDirs) {
        const fullInc = path4.isAbsolute(inc) ? inc : path4.resolve(workingDir, inc);
        sharedFlags.push(`-I${fullInc}`);
      }
    }
    if (options.defines) {
      for (const def of options.defines) {
        sharedFlags.push(`-D${def}`);
      }
    }
    if (options.lto) sharedFlags.push("-flto");
    if (options.sanitizers && options.sanitizers.length > 0) {
      sharedFlags.push(`-fsanitize=${options.sanitizers.join(",")}`);
    }
    if (options.pch) {
      const pchHeader = path4.isAbsolute(options.pch) ? options.pch : path4.resolve(workingDir, options.pch);
      sharedFlags.push(`-include`, pchHeader);
      sharedFlags.push("-Winvalid-pch");
    }
    const linkFlags = [];
    if (options.libDirs) {
      for (const libDir of options.libDirs) {
        const fullLibDir = path4.isAbsolute(libDir) ? libDir : path4.resolve(workingDir, libDir);
        linkFlags.push(`-L${fullLibDir}`);
      }
    }
    if (options.libs) {
      for (const lib of options.libs) {
        if (lib.startsWith("-l")) {
          linkFlags.push(lib);
        } else {
          linkFlags.push(`-l${lib}`);
        }
      }
    }
    if (options.customFlags && options.customFlags.length > 0) {
      linkFlags.push(...options.customFlags);
    }
    const objExt = getObjectExtension();
    const sourcesToCompile = [];
    for (const src of resolvedSources) {
      const objPath = path4.join(objDir, path4.basename(src, path4.extname(src)) + objExt);
      if (options.clean || isSourceNewerThanObject(src, objPath)) {
        sourcesToCompile.push(src);
      }
    }
    if (sourcesToCompile.length === 0 && !isDynamic && !isStatic) {
      const durationMs = Date.now() - startTime;
      const layout = discoverProjectLayout(workingDir, {
        srcDir: options.srcDir,
        includeDir: options.includeDir,
        vendorDir: options.vendorDir,
        autoDiscoverVendor: options.autoDiscoverVendor
      });
      return {
        success: true,
        executablePath: outputExe,
        durationMs,
        compiler: this.info,
        stdout: "",
        stderr: "",
        commandExecuted: "(incremental: all objects up to date)",
        copiedDlls: [],
        vendorBinDirs: layout.vendorBinDirs,
        projectInfo: { name: options.name, version: options.version, type: options.type }
      };
    }
    let finalStdout = "";
    let finalStderr = "";
    const commandParts = [];
    try {
      const compileArgs = [...sharedFlags, "-fPIC", "-c"];
      for (const src of sourcesToCompile) {
        const objPath = path4.join(objDir, path4.basename(src, path4.extname(src)) + objExt);
        compileArgs.push("-c", src, "-o", objPath);
      }
      if (sourcesToCompile.length > 0) {
        commandParts.push(`${this.info.executable} ${compileArgs.join(" ")}`);
        const { stdout, stderr } = await execFileAsync2(this.info.executable, compileArgs, {
          cwd: workingDir,
          maxBuffer: 20 * 1024 * 1024
        });
        if (stdout.trim()) finalStdout += stdout.trim() + "\n";
        if (stderr.trim()) finalStderr += stderr.trim() + "\n";
      }
      if (!isStatic) {
        const allObjs = fs4.readdirSync(objDir).filter((f) => f.endsWith(objExt)).map((f) => path4.join(objDir, f));
        if (allObjs.length > 0) {
          const linkArgs = [...sharedFlags];
          if (isDynamic) {
            linkArgs.push("-shared");
          }
          linkArgs.push(...allObjs, "-o", outputExe, ...linkFlags);
          commandParts.push(`${this.info.executable} ${linkArgs.join(" ")}`);
          const { stdout, stderr } = await execFileAsync2(this.info.executable, linkArgs, {
            cwd: workingDir,
            maxBuffer: 20 * 1024 * 1024
          });
          if (stdout.trim()) finalStdout += stdout.trim() + "\n";
          if (stderr.trim()) finalStderr += stderr.trim() + "\n";
        }
      }
      if (isStatic) {
        const allObjs = fs4.readdirSync(objDir).filter((f) => f.endsWith(objExt)).map((f) => path4.join(objDir, f));
        if (allObjs.length > 0) {
          const libTargetDir = path4.dirname(outputExe);
          if (!fs4.existsSync(libTargetDir)) {
            fs4.mkdirSync(libTargetDir, { recursive: true });
          }
          const arArgs = ["rcs", outputExe, ...allObjs];
          commandParts.push(`ar ${arArgs.join(" ")}`);
          try {
            const arResult = await execFileAsync2("ar", arArgs, {
              cwd: workingDir,
              maxBuffer: 20 * 1024 * 1024
            });
            if (arResult.stdout?.trim()) finalStdout += arResult.stdout.trim() + "\n";
            if (arResult.stderr?.trim()) finalStderr += arResult.stderr.trim() + "\n";
          } catch (arErr) {
            return {
              success: false,
              executablePath: outputExe,
              durationMs: Date.now() - startTime,
              compiler: this.info,
              stdout: (finalStdout + "\n" + (arErr.stdout || "")).trim(),
              stderr: (finalStderr + "\n" + (arErr.stderr || arErr.message || "")).trim(),
              commandExecuted: commandParts.join(" && ")
            };
          }
        }
      }
      const layout = discoverProjectLayout(workingDir, {
        srcDir: options.srcDir,
        includeDir: options.includeDir,
        vendorDir: options.vendorDir,
        autoDiscoverVendor: options.autoDiscoverVendor
      });
      let copiedDlls = [];
      if (options.copyDlls === true) {
        if (layout.runtimeDlls.length > 0) {
          copiedDlls = copyRuntimeDlls(layout.runtimeDlls, binDir);
        }
      }
      return {
        success: true,
        executablePath: outputExe,
        durationMs: Date.now() - startTime,
        compiler: this.info,
        stdout: finalStdout.trim(),
        stderr: finalStderr.trim(),
        commandExecuted: commandParts.join(" && "),
        copiedDlls,
        vendorBinDirs: layout.vendorBinDirs,
        projectInfo: {
          name: options.name,
          version: options.version,
          type: options.type
        }
      };
    } catch (err) {
      return {
        success: false,
        executablePath: outputExe,
        durationMs: Date.now() - startTime,
        compiler: this.info,
        stdout: (finalStdout + "\n" + (err.stdout || "")).trim(),
        stderr: (finalStderr + "\n" + (err.stderr || err.message || "")).trim(),
        commandExecuted: commandParts.join(" && ")
      };
    }
  }
};

// engine/src/compilers/detector.ts
var import_node_child_process3 = require("node:child_process");
var import_node_util3 = require("node:util");
var fs5 = __toESM(require("node:fs"));
var path5 = __toESM(require("node:path"));
var os = __toESM(require("node:os"));
var execFileAsync3 = (0, import_node_util3.promisify)(import_node_child_process3.execFile);
var execAsync2 = (0, import_node_util3.promisify)(import_node_child_process3.exec);
async function detectGcc() {
  try {
    const { stdout } = await execFileAsync3("g++", ["--version"]);
    const firstLine = stdout.split("\n")[0]?.trim() || "";
    const versionMatch = firstLine.match(/(\d+\.\d+(\.\d+)?)/);
    return {
      type: "gcc",
      name: "GCC (g++)",
      executable: "g++",
      version: versionMatch ? versionMatch[1] : void 0,
      available: true
    };
  } catch {
    return null;
  }
}
async function detectClang() {
  try {
    const { stdout } = await execFileAsync3("clang++", ["--version"]);
    const firstLine = stdout.split("\n")[0]?.trim() || "";
    const versionMatch = firstLine.match(/clang version (\d+\.\d+(\.\d+)?)/i);
    return {
      type: "clang",
      name: "Clang (clang++)",
      executable: "clang++",
      version: versionMatch ? versionMatch[1] : void 0,
      available: true
    };
  } catch {
    return null;
  }
}
async function findVsWherePath() {
  const commonVsWherePaths = [
    path5.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Microsoft Visual Studio", "Installer", "vswhere.exe"),
    path5.join(process.env["ProgramFiles"] || "C:\\Program Files", "Microsoft Visual Studio", "Installer", "vswhere.exe")
  ];
  for (const p of commonVsWherePaths) {
    if (fs5.existsSync(p)) {
      return p;
    }
  }
  try {
    await execFileAsync3("vswhere", ["-?"]);
    return "vswhere";
  } catch {
    return null;
  }
}
async function detectMsvc() {
  if (os.platform() !== "win32") {
    return null;
  }
  try {
    const { stderr, stdout } = await execFileAsync3("cl", [], { encoding: "utf8" }).catch((err) => ({
      stdout: err.stdout || "",
      stderr: err.stderr || ""
    }));
    const banner = (stdout + "\n" + stderr).trim();
    const match = banner.match(/Optimizing Compiler Version (\d+\.\d+\.\d+(\.\d+)?)/i);
    if (match) {
      return {
        type: "msvc",
        name: "MSVC (cl.exe in PATH)",
        executable: "cl.exe",
        version: match[1],
        available: true
      };
    }
  } catch {
  }
  const vswhere = await findVsWherePath();
  let vsInstallationPath = null;
  let vsDisplayName = "Visual Studio";
  if (vswhere) {
    try {
      const { stdout } = await execFileAsync3(vswhere, [
        "-latest",
        "-products",
        "*",
        "-requires",
        "Microsoft.VisualStudio.Component.VC.Tools.x86.x64",
        "-format",
        "json"
      ]);
      const parsed = JSON.parse(stdout.trim());
      if (Array.isArray(parsed) && parsed.length > 0) {
        vsInstallationPath = parsed[0].installationPath;
        vsDisplayName = parsed[0].displayName || vsDisplayName;
      }
    } catch {
    }
  }
  if (!vsInstallationPath) {
    const searchBases = [
      process.env["ProgramFiles"] || "C:\\Program Files",
      process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)"
    ];
    for (const base of searchBases) {
      const vsRoot = path5.join(base, "Microsoft Visual Studio");
      if (fs5.existsSync(vsRoot)) {
        try {
          const versions = fs5.readdirSync(vsRoot);
          for (const ver of versions) {
            const verDir = path5.join(vsRoot, ver);
            const editions = fs5.readdirSync(verDir);
            for (const ed of editions) {
              const candidate = path5.join(verDir, ed);
              const vcvars = path5.join(candidate, "VC", "Auxiliary", "Build", "vcvars64.bat");
              if (fs5.existsSync(vcvars)) {
                vsInstallationPath = candidate;
                vsDisplayName = `Visual Studio ${ver} ${ed}`;
                break;
              }
            }
            if (vsInstallationPath) break;
          }
        } catch {
        }
      }
      if (vsInstallationPath) break;
    }
  }
  if (vsInstallationPath) {
    const vcvars64 = path5.join(vsInstallationPath, "VC", "Auxiliary", "Build", "vcvars64.bat");
    const vcvarsall = path5.join(vsInstallationPath, "VC", "Auxiliary", "Build", "vcvarsall.bat");
    const vcvarsPath = fs5.existsSync(vcvars64) ? vcvars64 : fs5.existsSync(vcvarsall) ? vcvarsall : void 0;
    if (vcvarsPath) {
      let clPath = "cl.exe";
      let compilerVersion;
      const msvcToolsDir = path5.join(vsInstallationPath, "VC", "Tools", "MSVC");
      if (fs5.existsSync(msvcToolsDir)) {
        try {
          const toolVersions = fs5.readdirSync(msvcToolsDir).sort().reverse();
          if (toolVersions.length > 0) {
            compilerVersion = toolVersions[0];
            const candidateCl = path5.join(msvcToolsDir, compilerVersion, "bin", "Hostx64", "x64", "cl.exe");
            const candidateClCase = path5.join(msvcToolsDir, compilerVersion, "bin", "HostX64", "x64", "cl.exe");
            if (fs5.existsSync(candidateCl)) {
              clPath = candidateCl;
            } else if (fs5.existsSync(candidateClCase)) {
              clPath = candidateClCase;
            }
          }
        } catch {
        }
      }
      return {
        type: "msvc",
        name: `MSVC (${vsDisplayName})`,
        executable: clPath,
        vcvarsPath,
        version: compilerVersion,
        architecture: "x64",
        available: true
      };
    }
  }
  return null;
}
async function detectAllCompilers() {
  const [gcc, clang, msvc] = await Promise.all([
    detectGcc(),
    detectClang(),
    detectMsvc()
  ]);
  const compilers = [];
  if (msvc) compilers.push(msvc);
  if (gcc) compilers.push(gcc);
  if (clang) compilers.push(clang);
  return compilers;
}
async function selectCompiler(preference) {
  const allCompilers = await detectAllCompilers();
  if (allCompilers.length === 0) {
    throw new Error(
      "No supported C++ compiler detected on your system.\nPlease install Visual Studio with C++ tools, GCC (MinGW on Windows), or Clang."
    );
  }
  if (preference && preference !== "auto") {
    const matched = allCompilers.find((c) => c.type === preference);
    if (!matched) {
      const availableNames = allCompilers.map((c) => c.type).join(", ");
      throw new Error(
        `Requested compiler "${preference}" was not found on this system.
Available compilers: ${availableNames}`
      );
    }
    return matched;
  }
  if (os.platform() === "win32") {
    const msvc = allCompilers.find((c) => c.type === "msvc");
    if (msvc) return msvc;
    const clang = allCompilers.find((c) => c.type === "clang");
    if (clang) return clang;
    return allCompilers[0];
  } else {
    const clang = allCompilers.find((c) => c.type === "clang");
    if (clang) return clang;
    const gcc = allCompilers.find((c) => c.type === "gcc");
    if (gcc) return gcc;
    return allCompilers[0];
  }
}

// engine/src/compilers/index.ts
function createCompilerDriver(info) {
  if (info.type === "msvc") {
    return new MsvcCompilerDriver(info);
  }
  return new GccClangCompilerDriver(info);
}

// engine/src/runner.ts
var import_node_child_process4 = require("node:child_process");
var path6 = __toESM(require("node:path"));
var fs6 = __toESM(require("node:fs"));
var activeProcess = null;
process.on("SIGINT", () => {
  if (activeProcess && !activeProcess.killed) {
    activeProcess.kill("SIGINT");
  }
});
function runExecutable(executablePath, options = {}) {
  return new Promise((resolve10) => {
    if (!fs6.existsSync(executablePath)) {
      resolve10({
        exitCode: 1,
        signal: null,
        durationMs: 0,
        error: new Error(`Executable not found at path: ${executablePath}`)
      });
      return;
    }
    const startTime = Date.now();
    const cwd = options.cwd || path6.dirname(executablePath);
    const args = options.args || [];
    const env = { ...process.env, ...options.env || {} };
    if (options.vendorBinDirs && options.vendorBinDirs.length > 0) {
      const currentPath = env["PATH"] || env["Path"] || "";
      const prepend = options.vendorBinDirs.join(path6.delimiter);
      env["PATH"] = `${prepend}${path6.delimiter}${currentPath}`;
      env["Path"] = env["PATH"];
    }
    const child = (0, import_node_child_process4.spawn)(executablePath, args, {
      cwd,
      stdio: options.interactive === false ? ["pipe", "pipe", "pipe"] : "inherit",
      env,
      windowsHide: false
    });
    activeProcess = child;
    let timeoutTimer;
    if (options.timeout && options.timeout > 0) {
      timeoutTimer = setTimeout(() => {
        child.kill("SIGTERM");
      }, options.timeout);
    }
    child.on("error", (err) => {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      activeProcess = null;
      resolve10({
        exitCode: 1,
        signal: null,
        durationMs: Date.now() - startTime,
        error: err
      });
    });
    child.on("close", (exitCode, signal) => {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      activeProcess = null;
      resolve10({
        exitCode,
        signal: signal ? String(signal) : null,
        durationMs: Date.now() - startTime
      });
    });
  });
}

// engine/src/config.ts
var fs7 = __toESM(require("node:fs"));
var path7 = __toESM(require("node:path"));
var CONFIG_FILE_NAME = "cpp.json";
var LEGACY_CONFIG_FILE_NAME = "cppconfig.json";
var WORKSPACE_FILE_NAME = "workspace.json";
var LEGACY_WORKSPACE_FILE_NAME = "cppworkspace.json";
function findConfigFile(startDir = process.cwd()) {
  let currentDir = path7.resolve(startDir);
  while (true) {
    const candidatePrimary = path7.join(currentDir, CONFIG_FILE_NAME);
    if (fs7.existsSync(candidatePrimary)) {
      return candidatePrimary;
    }
    const candidateLegacy = path7.join(currentDir, LEGACY_CONFIG_FILE_NAME);
    if (fs7.existsSync(candidateLegacy)) {
      return candidateLegacy;
    }
    const parentDir = path7.dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }
    currentDir = parentDir;
  }
  return null;
}
function findWorkspaceConfigFile(startDir = process.cwd()) {
  let currentDir = path7.resolve(startDir);
  while (true) {
    const candidatePrimary = path7.join(currentDir, WORKSPACE_FILE_NAME);
    if (fs7.existsSync(candidatePrimary)) {
      return candidatePrimary;
    }
    const candidateLegacy = path7.join(currentDir, LEGACY_WORKSPACE_FILE_NAME);
    if (fs7.existsSync(candidateLegacy)) {
      return candidateLegacy;
    }
    const parentDir = path7.dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }
    currentDir = parentDir;
  }
  return null;
}
function loadConfigFile(configPath) {
  try {
    const content = fs7.readFileSync(configPath, "utf8");
    const parsed = JSON.parse(content);
    return parsed;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse configuration file at "${configPath}": ${message}`);
  }
}
function loadWorkspaceConfigFile(configPath) {
  try {
    const content = fs7.readFileSync(configPath, "utf8");
    const parsed = JSON.parse(content);
    return parsed;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse workspace configuration file at "${configPath}": ${message}`);
  }
}
function walkSubdirectories(dir, ignored, maxDepth = 4, currentDepth = 0) {
  if (currentDepth >= maxDepth) return [];
  const results = [];
  try {
    const entries = fs7.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const lower = entry.name.toLowerCase();
      if (ignored.has(lower) || entry.name.startsWith(".")) continue;
      const fullPath = path7.join(dir, entry.name);
      results.push(fullPath);
      results.push(...walkSubdirectories(fullPath, ignored, maxDepth, currentDepth + 1));
    }
  } catch {
  }
  return results;
}
function matchDirectoryGlob(baseDir, pattern, ignored) {
  const parts = pattern.replace(/\\/g, "/").split("/").filter(Boolean);
  let currentDirs = [baseDir];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const nextDirs = [];
    if (part === "**") {
      const remainingPattern = parts.slice(i + 1).join("/");
      for (const cur of currentDirs) {
        const allSubs = walkSubdirectories(cur, ignored, 4);
        if (!remainingPattern) {
          nextDirs.push(...allSubs);
        } else {
          for (const sub of allSubs) {
            nextDirs.push(...matchDirectoryGlob(sub, remainingPattern, ignored));
          }
        }
      }
      return [...new Set(nextDirs)];
    }
    const isWildcard = part.includes("*") || part.includes("?");
    const regex = isWildcard ? new RegExp("^" + part.replace(/\./g, "\\.").replace(/\*/g, ".*").replace(/\?/g, ".") + "$", "i") : null;
    for (const cur of currentDirs) {
      if (!fs7.existsSync(cur)) continue;
      try {
        const entries = fs7.readdirSync(cur, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          const lower = entry.name.toLowerCase();
          if (ignored.has(lower) || entry.name.startsWith(".")) continue;
          if (regex) {
            if (regex.test(entry.name)) {
              nextDirs.push(path7.join(cur, entry.name));
            }
          } else {
            if (lower === part.toLowerCase()) {
              nextDirs.push(path7.join(cur, entry.name));
            }
          }
        }
      } catch {
      }
    }
    currentDirs = nextDirs;
  }
  return currentDirs;
}
function findProjectInWorkspace(workspace, query) {
  const q = query.toLowerCase().trim().replace(/\\/g, "/");
  return workspace.projects.find((p) => {
    if (p.name.toLowerCase() === q) return true;
    if (path7.basename(p.dir).toLowerCase() === q) return true;
    if (p.relDir.toLowerCase() === q) return true;
    if (p.relDir.toLowerCase().endsWith("/" + q)) return true;
    return false;
  });
}
function discoverWorkspace(rootDir) {
  const wsConfigPath = findWorkspaceConfigFile(rootDir);
  if (!wsConfigPath) return null;
  const wsConfig = loadWorkspaceConfigFile(wsConfigPath);
  if (!Array.isArray(wsConfig.projects) || wsConfig.projects.length === 0) {
    return null;
  }
  const wsRootDir = path7.dirname(wsConfigPath);
  const ignored = /* @__PURE__ */ new Set([
    "node_modules",
    ".git",
    "target",
    "build",
    "dist",
    "script",
    ".vscode",
    ".idea",
    ".cache",
    "obj",
    "temp",
    "tmp",
    "vendor"
  ]);
  const candidateDirs = [];
  for (const pat of wsConfig.projects) {
    if (typeof pat !== "string") continue;
    const trimmed = pat.trim();
    if (!trimmed) continue;
    if (trimmed.includes("*") || trimmed.includes("?")) {
      candidateDirs.push(...matchDirectoryGlob(wsRootDir, trimmed, ignored));
    } else {
      const resolved = path7.resolve(wsRootDir, trimmed);
      if (fs7.existsSync(resolved) && fs7.statSync(resolved).isDirectory()) {
        candidateDirs.push(resolved);
      }
    }
  }
  const uniqueDirs = [...new Set(candidateDirs.map((d) => path7.resolve(d)))].filter(
    (d) => d !== wsRootDir
  );
  const projects = [];
  const rootCppJson = path7.join(wsRootDir, CONFIG_FILE_NAME);
  const legacyRootCppJson = path7.join(wsRootDir, LEGACY_CONFIG_FILE_NAME);
  const rootConfigPath = fs7.existsSync(rootCppJson) ? rootCppJson : fs7.existsSync(legacyRootCppJson) ? legacyRootCppJson : null;
  if (rootConfigPath) {
    const rootConfig = loadConfigFile(rootConfigPath);
    const rootSrcDir = path7.resolve(wsRootDir, rootConfig.srcDir || "src");
    const rootHasSources = fs7.existsSync(rootSrcDir) && fs7.statSync(rootSrcDir).isDirectory() || rootConfig.sources && rootConfig.sources.length > 0;
    if (rootHasSources) {
      projects.push({
        name: rootConfig.name || path7.basename(wsRootDir),
        dir: wsRootDir,
        relDir: ".",
        configPath: rootConfigPath,
        config: rootConfig,
        isRoot: true
      });
    }
  }
  for (const dir of uniqueDirs) {
    let projConfigPath = path7.join(dir, CONFIG_FILE_NAME);
    if (!fs7.existsSync(projConfigPath)) {
      projConfigPath = path7.join(dir, LEGACY_CONFIG_FILE_NAME);
    }
    let projConfig;
    if (fs7.existsSync(projConfigPath)) {
      try {
        projConfig = loadConfigFile(projConfigPath);
      } catch (err) {
        console.warn(`Warning: Could not parse config in ${dir}: ${err.message}`);
        continue;
      }
    } else {
      const hasSrcDir = fs7.existsSync(path7.join(dir, "src"));
      let hasRootSources = false;
      try {
        hasRootSources = fs7.readdirSync(dir).some((f) => isSourceFile(f));
      } catch {
      }
      if (hasSrcDir || hasRootSources) {
        projConfig = {
          name: path7.basename(dir),
          type: "exe",
          sources: hasSrcDir ? ["src/**/*.cpp"] : ["*.cpp"]
        };
        projConfigPath = path7.join(dir, CONFIG_FILE_NAME);
      } else {
        continue;
      }
    }
    const relDir = path7.relative(wsRootDir, dir).replace(/\\/g, "/");
    projects.push({
      name: projConfig.name || path7.basename(dir),
      dir,
      relDir,
      configPath: projConfigPath,
      config: projConfig,
      isRoot: false,
      dependencies: projConfig.dependsOn
    });
  }
  if (projects.length === 0 || projects.every((p) => p.isRoot)) {
    return null;
  }
  return {
    rootDir: wsRootDir,
    configPath: wsConfigPath,
    config: wsConfig,
    projects
  };
}
function generateDefaultWorkspaceConfig() {
  const template = {
    name: "workspace",
    projects: [
      "apps/*",
      "libs/*"
    ]
  };
  return JSON.stringify(template, null, 2) + "\n";
}
function normalizeProjectType(type) {
  if (!type) return "exe";
  const lower = type.toLowerCase().trim();
  if (lower === "dynamic" || lower === "shared" || lower === "dll") return "dynamic";
  if (lower === "static" || lower === "lib") return "static";
  if (lower === "header-only" || lower === "header") return "header-only";
  return "exe";
}
function normalizeProfile(profile) {
  if (!profile) return void 0;
  const lower = profile.toLowerCase().trim();
  if (lower === "debug" || lower === "dbg") return "debug";
  if (lower === "release" || lower === "rel") return "release";
  if (lower === "relwithdebinfo" || lower === "releasewithdebinfo" || lower === "rwdb") return "relwithdebinfo";
  if (lower === "minsizerel" || lower === "minsize") return "minsizerel";
  return void 0;
}
function mergeConfigWithOptions(config, cliOptions) {
  const workingDir = cliOptions.workingDir ?? process.cwd();
  const name = cliOptions.name ?? config?.name ?? path7.basename(workingDir);
  const version = cliOptions.version ?? config?.version ?? "1.0.0";
  const type = normalizeProjectType(cliOptions.type ?? config?.type ?? "exe");
  const profile = cliOptions.profile ?? normalizeProfile(config?.profile);
  const srcDir = cliOptions.srcDir ?? config?.srcDir ?? "src";
  const includeDir = cliOptions.includeDir ?? config?.includeDir ?? "include";
  const vendorDir = cliOptions.vendorDir ?? config?.vendorDir ?? "vendor";
  const targetDir = cliOptions.targetDir ?? config?.targetDir ?? "target";
  const binDir = cliOptions.binDir ?? config?.binDir ?? path7.join(targetDir, "bin");
  const objectDir = cliOptions.objectDir ?? config?.objectDir ?? path7.join(targetDir, "object");
  const libDir = cliOptions.libDir ?? config?.libDir ?? path7.join(targetDir, "lib");
  const autoDiscoverVendor = cliOptions.autoDiscoverVendor ?? config?.autoDiscoverVendor ?? true;
  const copyDlls = cliOptions.copyDlls ?? config?.copyDlls ?? true;
  const discovered = discoverProjectLayout(workingDir, {
    srcDir,
    includeDir,
    vendorDir,
    autoDiscoverVendor
  });
  const mergedSources = [
    ...cliOptions.sources && cliOptions.sources.length > 0 ? cliOptions.sources : config?.sources && config.sources.length > 0 ? config.sources : discovered.sourceFiles.length > 0 ? discovered.sourceFiles : ["main.cpp"]
  ];
  const mergedIncludes = [
    ...discovered.includeDirs,
    ...config?.includeDirs ?? [],
    ...cliOptions.includeDirs ?? []
  ];
  const mergedLibDirs = [
    ...discovered.libDirs,
    ...config?.libDirs ?? [],
    ...cliOptions.libDirs ?? []
  ];
  const mergedLibs = [
    ...discovered.libs,
    ...config?.libs ?? [],
    ...cliOptions.libs ?? []
  ];
  const mergedDefines = [
    ...config?.defines ?? [],
    ...cliOptions.defines ?? []
  ];
  const mergedCustomFlags = [
    ...config?.customFlags ?? [],
    ...cliOptions.customFlags ?? []
  ];
  const isWindows = process.platform === "win32";
  let output = cliOptions.output;
  if (!output) {
    if (config?.output) {
      output = config.output;
      const outputDir = path7.dirname(output).replace(/\\/g, "/");
      const outputDirLower = outputDir.toLowerCase();
      const binDirNorm = binDir.replace(/\\/g, "/").toLowerCase();
      const libDirNorm = libDir.replace(/\\/g, "/").toLowerCase();
      const isInBinDir = outputDirLower.endsWith("/bin") || outputDirLower === binDirNorm;
      if (type === "dynamic") {
        output = output.replace(/\.(exe|lib|a)$/i, isWindows ? ".dll" : ".so");
        if (isInBinDir && !outputDirLower.endsWith("/bin")) {
          output = path7.join(binDir, path7.basename(output));
        }
      } else if (type === "static") {
        const ext = isWindows ? ".lib" : ".a";
        output = output.replace(/\.(exe|dll|so)$/i, ext);
        if (isInBinDir) {
          output = path7.join(libDir, path7.basename(output));
        }
      } else if (type === "exe") {
        output = output.replace(/\.(dll|so|lib|a)$/i, isWindows ? ".exe" : "");
        if (!isInBinDir && !outputDirLower.endsWith("/bin")) {
          output = path7.join(binDir, path7.basename(output));
        }
      }
    } else {
      if (type === "dynamic") {
        const ext = isWindows ? ".dll" : ".so";
        output = path7.join(binDir, `${name}${ext}`);
      } else if (type === "static") {
        const ext = isWindows ? ".lib" : ".a";
        output = path7.join(libDir, `${name}${ext}`);
      } else {
        const ext = isWindows ? ".exe" : "";
        output = path7.join(binDir, `${name}${ext}`);
      }
    }
  }
  return {
    name,
    version,
    type,
    sources: mergedSources,
    output,
    compiler: cliOptions.compiler ?? config?.compiler ?? "auto",
    profile,
    std: cliOptions.std ?? config?.std ?? "c++20",
    cStandard: cliOptions.cStandard ?? config?.cStandard,
    optimization: cliOptions.optimization ?? config?.optimization ?? "O2",
    debug: cliOptions.debug ?? config?.debug ?? false,
    warnings: cliOptions.warnings ?? config?.warnings ?? "default",
    warningsAsErrors: cliOptions.warningsAsErrors ?? config?.warningsAsErrors ?? false,
    srcDir,
    includeDir,
    vendorDir,
    targetDir,
    binDir,
    objectDir,
    libDir,
    autoDiscoverVendor,
    copyDlls,
    includeDirs: [...new Set(mergedIncludes)],
    libDirs: [...new Set(mergedLibDirs)],
    libs: [...new Set(mergedLibs)],
    defines: [...new Set(mergedDefines)],
    customFlags: mergedCustomFlags,
    clean: cliOptions.clean ?? false,
    parallel: cliOptions.parallel ?? config?.parallel,
    jobs: cliOptions.jobs ?? config?.jobs,
    sanitizers: cliOptions.sanitizers ?? config?.sanitizers,
    lto: cliOptions.lto ?? config?.lto,
    pch: cliOptions.pch ?? config?.pch,
    workingDir
  };
}
function generateDefaultConfig() {
  const template = {
    name: "app",
    version: "1.0.0",
    type: "exe",
    description: "C++ application project",
    author: "",
    license: "MIT",
    compiler: "auto",
    profile: "release",
    std: "c++20",
    optimization: "O2",
    debug: false,
    warnings: "default",
    warningsAsErrors: false,
    srcDir: "src",
    vendorDir: "vendor",
    targetDir: "target",
    binDir: "target/bin",
    objectDir: "target/object",
    libDir: "target/lib",
    autoDiscoverVendor: true,
    copyDlls: true,
    sources: ["src/**/*.cpp"],
    output: "target/bin/app.exe",
    includeDirs: [],
    libDirs: [],
    libs: [],
    defines: [],
    customFlags: [],
    parallel: true
  };
  return JSON.stringify(template, null, 2) + "\n";
}

// engine/src/watcher.ts
var fs8 = __toESM(require("node:fs"));
var path8 = __toESM(require("node:path"));
var WATCH_EXTENSIONS = /* @__PURE__ */ new Set([".cpp", ".cc", ".cxx", ".c++", ".h", ".hpp", ".hxx", ".json"]);
var IGNORED_DIRS = /* @__PURE__ */ new Set([".git", "node_modules", "dist", "build", "target"]);
var FileWatcher = class {
  constructor(options) {
    this.options = options;
  }
  options;
  watchers = [];
  debounceTimer = null;
  isProcessing = false;
  pendingPath = null;
  start() {
    const { targets, debounceMs = 200 } = this.options;
    const dirsToWatch = /* @__PURE__ */ new Set();
    for (const target of targets) {
      if (fs8.existsSync(target)) {
        const stat = fs8.statSync(target);
        if (stat.isDirectory()) {
          dirsToWatch.add(path8.resolve(target));
        } else {
          dirsToWatch.add(path8.resolve(path8.dirname(target)));
        }
      } else {
        const parent = path8.resolve(path8.dirname(target));
        if (fs8.existsSync(parent)) {
          dirsToWatch.add(parent);
        }
      }
    }
    if (dirsToWatch.size === 0) {
      dirsToWatch.add(process.cwd());
    }
    for (const dir of dirsToWatch) {
      try {
        const watcher = fs8.watch(
          dir,
          { recursive: true },
          (_eventType, filename) => {
            if (!filename) return;
            const parts = filename.split(/[/\\]/);
            if (parts.some((p) => IGNORED_DIRS.has(p))) {
              return;
            }
            const ext = path8.extname(filename).toLowerCase();
            if (!WATCH_EXTENSIONS.has(ext)) {
              return;
            }
            const fullPath = path8.join(dir, filename);
            this.pendingPath = fullPath;
            if (this.debounceTimer) {
              clearTimeout(this.debounceTimer);
            }
            this.debounceTimer = setTimeout(async () => {
              if (this.isProcessing) return;
              this.isProcessing = true;
              try {
                if (this.pendingPath) {
                  await this.options.onChange(this.pendingPath);
                }
              } catch (err) {
                console.error("Error handling file change:", err);
              } finally {
                this.isProcessing = false;
              }
            }, debounceMs);
          }
        );
        this.watchers.push(watcher);
      } catch (err) {
        console.warn(`Warning: Could not attach recursive watcher to ${dir}:`, err);
      }
    }
  }
  stop() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    for (const watcher of this.watchers) {
      watcher.close();
    }
    this.watchers = [];
  }
};

// engine/src/workspace.ts
var fs9 = __toESM(require("node:fs"));
var path9 = __toESM(require("node:path"));
function sortProjectsTopologically(projects, workspace) {
  const sorted = [];
  const visited = /* @__PURE__ */ new Set();
  const visiting = /* @__PURE__ */ new Set();
  function visit(p, stack) {
    const key = p.dir;
    if (visiting.has(key)) {
      const cycle = [...stack, p.name].join(" -> ");
      throw new Error(`Circular workspace dependency detected: ${cycle}`);
    }
    if (visited.has(key)) return;
    visiting.add(key);
    stack.push(p.name);
    const deps = p.config.dependsOn || [];
    for (const depName of deps) {
      const depProject = findProjectInWorkspace(workspace, depName);
      if (!depProject) {
        throw new Error(
          `Project "${p.name}" depends on "${depName}", but "${depName}" was not found in workspace.`
        );
      }
      visit(depProject, stack);
    }
    visiting.delete(key);
    visited.add(key);
    stack.pop();
    sorted.push(p);
  }
  for (const project of projects) {
    if (!visited.has(project.dir)) {
      visit(project, []);
    }
  }
  return sorted;
}
function getDependenciesInBuildOrder(project, workspace) {
  const allDeps = [];
  const visited = /* @__PURE__ */ new Set();
  function collect(p) {
    const deps = p.config.dependsOn || [];
    for (const depName of deps) {
      const depProject = findProjectInWorkspace(workspace, depName);
      if (!depProject) {
        throw new Error(
          `Project "${p.name}" depends on "${depName}", but "${depName}" was not found in workspace.`
        );
      }
      if (!visited.has(depProject.dir)) {
        visited.add(depProject.dir);
        collect(depProject);
        allDeps.push(depProject);
      }
    }
  }
  collect(project);
  return allDeps;
}
function resolveDependencyArtifacts(project, workspace) {
  const deps = getDependenciesInBuildOrder(project, workspace);
  const includeDirs = [];
  const libDirs = [];
  const libs = [];
  const runtimeDlls = [];
  const vendorBinDirs = [];
  for (const dep of deps) {
    const depDir = dep.dir;
    const depType = (dep.config.type || "exe").toLowerCase();
    const incCandidate = path9.join(depDir, dep.config.includeDir || "include");
    const srcCandidate = path9.join(depDir, dep.config.srcDir || "src");
    if (fs9.existsSync(incCandidate)) {
      includeDirs.push(incCandidate);
    }
    if (fs9.existsSync(srcCandidate)) {
      includeDirs.push(srcCandidate);
    }
    includeDirs.push(depDir);
    if (dep.config.includeDirs) {
      for (const inc of dep.config.includeDirs) {
        includeDirs.push(path9.isAbsolute(inc) ? inc : path9.resolve(depDir, inc));
      }
    }
    if (depType === "static" || depType === "lib") {
      const targetLibDir = path9.resolve(depDir, dep.config.libDir || "target/lib");
      if (fs9.existsSync(targetLibDir)) {
        libDirs.push(targetLibDir);
      }
      const isWindows = process.platform === "win32";
      const libExt = isWindows ? ".lib" : ".a";
      const baseName = dep.config.name || path9.basename(depDir);
      if (dep.config.output) {
        const outBase = path9.basename(dep.config.output);
        libs.push(outBase);
        const outDir = path9.dirname(path9.resolve(depDir, dep.config.output));
        libDirs.push(outDir);
      } else {
        libs.push(`${baseName}${libExt}`);
      }
    }
    if (depType === "dynamic" || depType === "shared" || depType === "dll") {
      const isWindows = process.platform === "win32";
      const targetLibDir = path9.resolve(depDir, dep.config.libDir || "target/lib");
      const targetBinDir = path9.resolve(depDir, dep.config.binDir || "target/bin");
      if (fs9.existsSync(targetLibDir)) {
        libDirs.push(targetLibDir);
      }
      if (fs9.existsSync(targetBinDir)) {
        vendorBinDirs.push(targetBinDir);
        try {
          const files = fs9.readdirSync(targetBinDir);
          for (const file of files) {
            if (file.toLowerCase().endsWith(isWindows ? ".dll" : ".so")) {
              runtimeDlls.push(path9.join(targetBinDir, file));
            }
          }
        } catch {
        }
      }
      const baseName = dep.config.name || path9.basename(depDir);
      if (dep.config.output) {
        const outBase = path9.basename(dep.config.output);
        const importLib = outBase.replace(/\.(dll|so)$/i, isWindows ? ".lib" : "");
        libs.push(importLib);
        const outDir = path9.dirname(path9.resolve(depDir, dep.config.output));
        libDirs.push(outDir);
      } else {
        libs.push(isWindows ? `${baseName}.lib` : baseName);
      }
    }
  }
  return {
    includeDirs: [...new Set(includeDirs)],
    libDirs: [...new Set(libDirs)],
    libs: [...new Set(libs)],
    runtimeDlls: [...new Set(runtimeDlls)],
    vendorBinDirs: [...new Set(vendorBinDirs)]
  };
}
async function buildWithDependencies(project, workspace, baseOptions = {}, onStep) {
  const deps = getDependenciesInBuildOrder(project, workspace);
  for (const dep of deps) {
    const depType = (dep.config.type || "exe").toLowerCase();
    if (depType === "header-only") continue;
    if (onStep) onStep(dep, true);
    const depOptions = {
      workingDir: dep.dir,
      profile: baseOptions.profile ?? dep.config.profile,
      compiler: baseOptions.compiler ?? dep.config.compiler,
      clean: baseOptions.clean
    };
    const depResult = await compile(depOptions);
    if (!depResult.success) {
      throw new Error(`Failed to build dependency "${dep.name}":
${depResult.stderr || depResult.stdout}`);
    }
  }
  const artifacts = resolveDependencyArtifacts(project, workspace);
  if (onStep) onStep(project, false);
  const targetOptions = {
    ...baseOptions,
    workingDir: project.dir,
    includeDirs: [...baseOptions.includeDirs || [], ...artifacts.includeDirs],
    libDirs: [...baseOptions.libDirs || [], ...artifacts.libDirs],
    libs: [...baseOptions.libs || [], ...artifacts.libs]
  };
  const result = await compile(targetOptions);
  if (result.success && artifacts.runtimeDlls.length > 0) {
    const targetBinDir = path9.dirname(result.executablePath);
    if (!fs9.existsSync(targetBinDir)) {
      fs9.mkdirSync(targetBinDir, { recursive: true });
    }
    const copied = result.copiedDlls || [];
    for (const dll of artifacts.runtimeDlls) {
      const dest = path9.join(targetBinDir, path9.basename(dll));
      try {
        fs9.copyFileSync(dll, dest);
        copied.push(path9.basename(dll));
      } catch {
      }
    }
    result.copiedDlls = [...new Set(copied)];
  }
  if (artifacts.vendorBinDirs.length > 0) {
    result.vendorBinDirs = [
      ...result.vendorBinDirs || [],
      ...artifacts.vendorBinDirs
    ];
  }
  return result;
}

// engine/src/packager.ts
var fs10 = __toESM(require("node:fs"));
var path10 = __toESM(require("node:path"));
var import_node_child_process5 = require("node:child_process");
var import_node_util4 = require("node:util");
var execFileAsync4 = (0, import_node_util4.promisify)(import_node_child_process5.execFile);
function copyRecursiveSync(src, dest) {
  const stat = fs10.statSync(src);
  if (stat.isDirectory()) {
    if (!fs10.existsSync(dest)) {
      fs10.mkdirSync(dest, { recursive: true });
    }
    const entries = fs10.readdirSync(src);
    for (const entry of entries) {
      copyRecursiveSync(path10.join(src, entry), path10.join(dest, entry));
    }
  } else {
    const parent = path10.dirname(dest);
    if (!fs10.existsSync(parent)) {
      fs10.mkdirSync(parent, { recursive: true });
    }
    fs10.copyFileSync(src, dest);
  }
}
async function createZipArchive(sourceDir, zipPath) {
  if (fs10.existsSync(zipPath)) {
    try {
      fs10.unlinkSync(zipPath);
    } catch {
    }
  }
  const isWindows = process.platform === "win32";
  try {
    if (isWindows) {
      const psCommand = `Compress-Archive -Path "${path10.join(sourceDir, "*")}" -DestinationPath "${zipPath}" -Force`;
      await execFileAsync4("powershell", ["-NoProfile", "-Command", psCommand], { windowsHide: true });
      return fs10.existsSync(zipPath);
    } else {
      await execFileAsync4("zip", ["-r", zipPath, "."], { cwd: sourceDir });
      return fs10.existsSync(zipPath);
    }
  } catch {
    return false;
  }
}
async function packageProject(options = {}) {
  const startTime = Date.now();
  const rootDir = options.workingDir || process.cwd();
  const workspace = discoverWorkspace(rootDir);
  let targetDir = rootDir;
  let targetProject;
  if (workspace) {
    if (options.project) {
      targetProject = findProjectInWorkspace(workspace, options.project);
      if (!targetProject) {
        throw new Error(`Project "${options.project}" not found in workspace.`);
      }
      targetDir = targetProject.dir;
    } else {
      targetProject = workspace.projects.find((p) => p.isRoot) || workspace.projects.find((p) => p.config.type !== "header-only");
      if (targetProject) {
        targetDir = targetProject.dir;
      }
    }
  }
  const configPath = findConfigFile(targetDir);
  if (!configPath) {
    throw new Error(`No cpp.json found in "${targetDir}".`);
  }
  const config = loadConfigFile(configPath);
  const name = config.name || path10.basename(targetDir);
  const version = config.version || "1.0.0";
  const profile = options.profile || "release";
  const platform2 = process.platform;
  const arch = process.arch;
  const compileOptions = {
    workingDir: targetDir,
    profile,
    compiler: options.compiler,
    clean: options.clean
  };
  let compileResult;
  if (targetProject && workspace && targetProject.config.dependsOn && targetProject.config.dependsOn.length > 0) {
    compileResult = await buildWithDependencies(targetProject, workspace, compileOptions);
  } else {
    compileResult = await compile(compileOptions);
  }
  if (!compileResult.success) {
    throw new Error(`Build failed prior to packaging:
${compileResult.stderr || compileResult.stdout}`);
  }
  const distBase = options.distDir ? path10.resolve(rootDir, options.distDir) : path10.resolve(rootDir, "dist");
  const packageName = `${name}-${version}-${platform2}-${arch}`;
  const packageDir = path10.join(distBase, packageName);
  if (fs10.existsSync(packageDir)) {
    fs10.rmSync(packageDir, { recursive: true, force: true });
  }
  fs10.mkdirSync(packageDir, { recursive: true });
  const copiedFiles = [];
  const exePath = compileResult.executablePath;
  if (fs10.existsSync(exePath)) {
    const destExe = path10.join(packageDir, path10.basename(exePath));
    fs10.copyFileSync(exePath, destExe);
    copiedFiles.push(path10.basename(exePath));
  }
  const binDir = path10.dirname(exePath);
  const isWindows = process.platform === "win32";
  const dllExt = isWindows ? ".dll" : ".so";
  if (fs10.existsSync(binDir)) {
    const binFiles = fs10.readdirSync(binDir);
    for (const file of binFiles) {
      if (file.toLowerCase().endsWith(dllExt)) {
        const destDll = path10.join(packageDir, file);
        fs10.copyFileSync(path10.join(binDir, file), destDll);
        copiedFiles.push(file);
      }
    }
  }
  const assetSources = config.assets || ["assets", "resources", "config"];
  for (const assetRel of assetSources) {
    const assetPath = path10.resolve(targetDir, assetRel);
    if (fs10.existsSync(assetPath)) {
      const destAsset = path10.join(packageDir, path10.basename(assetPath));
      copyRecursiveSync(assetPath, destAsset);
      copiedFiles.push(path10.basename(assetPath) + (fs10.statSync(assetPath).isDirectory() ? "/" : ""));
    }
  }
  const manifest = {
    name,
    version,
    platform: platform2,
    architecture: arch,
    compiler: compileResult.compiler.name,
    profile,
    packagedAt: (/* @__PURE__ */ new Date()).toISOString(),
    files: copiedFiles
  };
  fs10.writeFileSync(path10.join(packageDir, "package-info.json"), JSON.stringify(manifest, null, 2), "utf8");
  copiedFiles.push("package-info.json");
  let zipPath;
  if (options.zip) {
    const zipTarget = `${packageDir}.zip`;
    const zipped = await createZipArchive(packageDir, zipTarget);
    if (zipped) {
      zipPath = zipTarget;
    }
  }
  return {
    success: true,
    packageName,
    packageDir,
    zipPath,
    executablePath: exePath,
    copiedFiles: [...new Set(copiedFiles)],
    durationMs: Date.now() - startTime
  };
}

// engine/src/ui.ts
var isColorSupported = !process.env.NO_COLOR && (process.stdout.isTTY || process.env.FORCE_COLOR !== void 0);
var colors = {
  reset: (str) => isColorSupported ? `\x1B[0m${str}\x1B[0m` : str,
  bold: (str) => isColorSupported ? `\x1B[1m${str}\x1B[22m` : str,
  dim: (str) => isColorSupported ? `\x1B[2m${str}\x1B[22m` : str,
  green: (str) => isColorSupported ? `\x1B[32m${str}\x1B[39m` : str,
  yellow: (str) => isColorSupported ? `\x1B[33m${str}\x1B[39m` : str,
  red: (str) => isColorSupported ? `\x1B[31m${str}\x1B[39m` : str,
  cyan: (str) => isColorSupported ? `\x1B[36m${str}\x1B[39m` : str,
  blue: (str) => isColorSupported ? `\x1B[34m${str}\x1B[39m` : str,
  magenta: (str) => isColorSupported ? `\x1B[35m${str}\x1B[39m` : str,
  gray: (str) => isColorSupported ? `\x1B[90m${str}\x1B[39m` : str
};
var badges = {
  sugar: colors.magenta(colors.bold("[SUGAR++]")),
  cppc: colors.magenta(colors.bold("[SUGAR++]")),
  success: colors.green(colors.bold("[SUCCESS]")),
  error: colors.red(colors.bold("[ERROR]")),
  warn: colors.yellow(colors.bold("[WARN]")),
  info: colors.blue(colors.bold("[INFO]")),
  run: colors.cyan(colors.bold("[RUN]")),
  watch: colors.cyan(colors.bold("[WATCH]"))
};
function formatDuration(ms) {
  if (ms < 1e3) return `${ms}ms`;
  return `${(ms / 1e3).toFixed(2)}s`;
}
function logCompilerOutput(stdout, stderr) {
  if (stdout) {
    console.log(colors.gray(stdout));
  }
  if (stderr) {
    console.error(colors.red(stderr));
  }
}

// engine/src/ui/prompts.ts
var readline = __toESM(require("node:readline"));
async function promptSelect(config) {
  const { title, options, defaultIndex = 0 } = config;
  if (!process.stdin.isTTY || !process.stdout.isTTY || typeof process.stdin.setRawMode !== "function") {
    return options[defaultIndex]?.value ?? "";
  }
  return new Promise((resolve10, reject) => {
    let currentIndex = Math.max(0, Math.min(defaultIndex, options.length - 1));
    let isResolved = false;
    let renderedLines = 0;
    const clearMenu = () => {
      if (renderedLines > 0) {
        readline.cursorTo(process.stdout, 0);
        readline.moveCursor(process.stdout, 0, -renderedLines);
        readline.clearScreenDown(process.stdout);
        renderedLines = 0;
      }
    };
    const cleanup = () => {
      if (!isResolved) {
        isResolved = true;
        process.stdin.removeListener("keypress", onKeypress);
        if (process.stdin.isTTY && typeof process.stdin.setRawMode === "function") {
          process.stdin.setRawMode(false);
        }
        process.stdin.pause();
        process.stdout.write("\x1B[?25h");
        clearMenu();
      }
    };
    const render = () => {
      clearMenu();
      const lines = [];
      lines.push(`  ${colors.bold(colors.cyan(title))}`);
      lines.push(`  ${colors.gray("\u2500".repeat(40))}`);
      for (let i = 0; i < options.length; i++) {
        const opt = options[i];
        const isSelected = i === currentIndex;
        const cursor = isSelected ? colors.green("\u25B8") : " ";
        const label = isSelected ? colors.bold(colors.green(opt.label)) : opt.label;
        const desc = opt.description ? colors.gray(`  ${opt.description}`) : "";
        lines.push(`  ${cursor} ${label}${desc}`);
      }
      lines.push(`  ${colors.gray("\u2500".repeat(40))}`);
      lines.push(`  ${colors.gray("\u2191\u2193 Navigate  \u21B5 Select  Esc Cancel")}`);
      process.stdout.write(lines.join("\n") + "\n");
      renderedLines = lines.length;
    };
    const onKeypress = (str, key) => {
      if (isResolved) return;
      if (key && key.ctrl && key.name === "c" || str === "") {
        cleanup();
        process.exit(130);
      }
      if (key && (key.name === "up" || key.name === "k")) {
        currentIndex = (currentIndex - 1 + options.length) % options.length;
        render();
      } else if (key && (key.name === "down" || key.name === "j")) {
        currentIndex = (currentIndex + 1) % options.length;
        render();
      } else if (key && (key.name === "return" || key.name === "enter") || str === "\r" || str === "\n") {
        const selectedValue = options[currentIndex].value;
        cleanup();
        resolve10(selectedValue);
      } else if (key && key.name === "escape" || str === "\x1B") {
        cleanup();
        reject(new Error("cancelled"));
      } else if (str && /^[1-9]$/.test(str)) {
        const num = parseInt(str, 10);
        if (num >= 1 && num <= options.length) {
          currentIndex = num - 1;
          render();
        }
      }
    };
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdout.write("\x1B[?25l");
    process.stdin.on("keypress", onKeypress);
    render();
  });
}

// engine/src/index.ts
async function compile(options = {}) {
  const configFile = findConfigFile(options.workingDir);
  const fileConfig = configFile ? loadConfigFile(configFile) : null;
  const finalOptions = mergeConfigWithOptions(fileConfig, options);
  const compilerInfo = await selectCompiler(finalOptions.compiler);
  const driver = createCompilerDriver(compilerInfo);
  return driver.compile(finalOptions);
}

// engine/sugar.ts
var PROFILES = [
  { label: "Release", value: "release", description: "-O2 optimized, no debug symbols" },
  { label: "Debug", value: "debug", description: "-O0 -g debug symbols, no optimization" },
  { label: "RelWithDebInfo", value: "relwithdebinfo", description: "-O2 -g optimized with debug symbols" },
  { label: "MinSizeRel", value: "minsizerel", description: "-Os minimum size optimized" }
];
var HELP_TEXT = `
${colors.bold(colors.magenta("Sugar++"))} ${colors.gray("(spp / s++)")} - The Sweet, Zero-Config C++ Build Engine

${colors.bold("USAGE:")}
  ${colors.green("spp")} [command] [sources...] [options] [-- <program-arguments>]
  ${colors.green("s++")} [command] [sources...] [options] [-- <program-arguments>]

${colors.bold("COMMANDS:")}
  ${colors.cyan("build")} [sources...]       Compile source files (default command)
  ${colors.cyan("run")}   [sources...]       Compile and immediately run the binary
  ${colors.cyan("package")}, ${colors.cyan("dist")}       Bundle executable, runtime DLLs & assets into dist/
  ${colors.cyan("test")}  [sources...]       Compile and run tests (GoogleTest/Catch2/doctest)
  ${colors.cyan("watch")} [sources...]       Watch files and recompile (and rerun) on change
  ${colors.cyan("workspace")}                Build all projects in a workspace
  ${colors.cyan("list-compilers")}           Show all detected C++ compilers on this machine
  ${colors.cyan("init")}                     Create a starter cpp.json (or --workspace for workspace.json)
  ${colors.cyan("help")}, ${colors.cyan("--help")}, ${colors.cyan("-h")}     Show this help guide
  ${colors.cyan("--version")}, ${colors.cyan("-v")}          Show CLI version

${colors.bold("OPTIONS:")}
  ${colors.yellow("-o, --out <path>")}         Output executable file path (e.g. target/bin/app.exe)
  ${colors.yellow("-P, --project <name>")}     Target a specific project in a workspace
  ${colors.yellow("--zip")}                    Create a compressed .zip archive of the package
  ${colors.yellow("--dist-dir <dir>")}         Output directory for packages (default: dist)
  ${colors.yellow("--dll, --shared")}          Build as dynamic shared library (.dll / .so)
  ${colors.yellow("--static")}                 Build as static library (.lib / .a)
  ${colors.yellow("-t, --target <dir>")}       Target output root directory (default: target)
  ${colors.yellow("--objdir <dir>")}           Directory for intermediate object files (default: target/object)
  ${colors.yellow("--bindir <dir>")}           Directory for final binaries & DLLs (default: target/bin)
  ${colors.yellow("-c, --compiler <name>")}    Force compiler: auto | msvc | gcc | clang
  ${colors.yellow("-s, --std <standard>")}     C++ standard: c++11 | c++14 | c++17 | c++20 | c++23 | latest
  ${colors.yellow("--c-std <standard>")}       C standard: c11 | c17 | c23 (for mixed C/C++ projects)
  ${colors.yellow("-p, --profile <name>")}     Build profile: debug | release | relwithdebinfo | minsizerel
  ${colors.yellow("-O, --opt <level>")}        Optimization: O0 | O1 | O2 | O3 | Os | Oz (default: O2)
  ${colors.yellow("-g, --debug")}              Include debug symbols (PDB for MSVC / DWARF for GCC)
  ${colors.yellow("-W, --warnings <level>")}   Warning level: default | all | none
  ${colors.yellow("-Werror")}                  Treat compiler warnings as errors
  ${colors.yellow("-I, --include <dir>")}      Add include directory (can be used multiple times)
  ${colors.yellow("-L, --libdir <dir>")}       Add library search directory (can be used multiple times)
  ${colors.yellow("-l, --lib <name>")}         Link library (e.g. ws2_32, pthread)
  ${colors.yellow("-D, --define <name>")}      Define preprocessor macro (can be used multiple times)
  ${colors.yellow("-a, --args <string>")}      Arguments to pass to program when running
  ${colors.yellow("--clean")}                  Delete previous build artifacts before compiling
  ${colors.yellow("--verbose")}                Print full compiler command and internal details
  ${colors.yellow("--parallel, -j[N]")}        Enable parallel compilation (default: auto-detect cores)
  ${colors.yellow("--no-parallel")}            Disable parallel compilation
  ${colors.yellow("--sanitize <kinds>")}       Sanitizers: address,undefined,thread,memory,leak (comma-separated)
  ${colors.yellow("--lto")}                   Enable Link-Time Optimization
  ${colors.yellow("--pch <header>")}           Use precompiled header
  ${colors.yellow("-i, --interactive, --menu")} Force interactive selection menu

${colors.bold("TEST COMMAND:")}
  ${colors.yellow("--filter <expr>")}          Test filter expression (e.g. "*MathTest*")
  ${colors.yellow("--framework <name>")}       Test framework: auto | gtest | catch2 | doctest
  ${colors.yellow("--no-rebuild")}             Skip recompilation before running tests

${colors.bold("BUILD PROFILES:")}
  ${colors.cyan("debug")}               -O0 -g (debug symbols, no optimization)
  ${colors.cyan("release")}             -O2 (optimized, no debug)
  ${colors.cyan("relwithdebinfo")}      -O2 -g (optimized with debug symbols)
  ${colors.cyan("minsizerel")}          -Os (minimum size optimized)

${colors.bold("EXAMPLES:")}
  ${colors.gray("# Interactive build (shows project & config picker)")}
  ${colors.green("spp build")}

  ${colors.gray("# Skip menu, build release directly")}
  ${colors.green("spp build --profile release")}

  ${colors.gray("# Build specific project in a workspace")}
  ${colors.green("spp build --project game")}

  ${colors.gray("# Build all workspace projects")}
  ${colors.green("spp workspace")}

  ${colors.gray("# Compile and run with C++20")}
  ${colors.green("spp run main.cpp --std c++20")}

  ${colors.gray("# Compile as static library")}
  ${colors.green("spp build --static")}

  ${colors.gray("# Package project for distribution")}
  ${colors.green("spp package --zip")}

  ${colors.gray("# Run tests")}
  ${colors.green("spp test")}

  ${colors.gray("# Watch source files and automatically re-run on save")}
  ${colors.green("spp watch main.cpp --run")}
`;
function parseArgs(rawArgs) {
  const separatorIndex = rawArgs.indexOf("--");
  let cliArgs = rawArgs;
  let programArgs = [];
  if (separatorIndex !== -1) {
    cliArgs = rawArgs.slice(0, separatorIndex);
    programArgs = rawArgs.slice(separatorIndex + 1);
  }
  let command = "build";
  const sources = [];
  const options = {
    includeDirs: [],
    libDirs: [],
    libs: [],
    defines: [],
    customFlags: []
  };
  let watchRun = false;
  let verbose = false;
  let testFilter;
  let testFramework;
  let testRebuild = true;
  let projectName;
  let packageZip = false;
  let distDir;
  let interactive = false;
  let i = 0;
  if (cliArgs.length > 0) {
    const first = cliArgs[0].toLowerCase();
    if (["build", "run", "package", "dist", "test", "watch", "workspace", "list-compilers", "init", "help"].includes(first)) {
      command = first === "dist" ? "package" : first;
      i = 1;
    } else if (first === "--help" || first === "-h") {
      command = "help";
      i = 1;
    } else if (first === "--version" || first === "-v") {
      command = "version";
      i = 1;
    }
  }
  for (; i < cliArgs.length; i++) {
    const arg = cliArgs[i];
    const nextVal = () => {
      if (i + 1 < cliArgs.length) return cliArgs[++i];
      console.error(`${badges.error} Flag ${colors.yellow(arg)} requires a value`);
      process.exit(1);
      return "";
    };
    if (arg === "--help" || arg === "-h") {
      command = "help";
    } else if (arg === "--version" || arg === "-v") {
      command = "version";
    } else if (arg === "--verbose") {
      verbose = true;
    } else if (arg === "--run") {
      watchRun = true;
    } else if (arg === "--clean") {
      options.clean = true;
    } else if (arg === "-g" || arg === "--debug") {
      options.debug = true;
    } else if (arg === "-Werror") {
      options.warningsAsErrors = true;
    } else if (arg === "--dll" || arg === "--shared") {
      options.type = "shared";
    } else if (arg === "--static") {
      options.type = "static";
    } else if (arg === "--exe") {
      options.type = "executable";
    } else if (arg === "--parallel" || arg === "-j") {
      if (arg === "-j" && i + 1 < cliArgs.length && /^\d+$/.test(cliArgs[i + 1])) {
        options.jobs = parseInt(cliArgs[++i]);
      } else {
        options.parallel = true;
      }
    } else if (arg === "--no-parallel") {
      options.parallel = false;
    } else if (arg === "--lto") {
      options.lto = true;
    } else if (arg === "--pch") {
      options.pch = nextVal();
    } else if (arg === "--sanitize") {
      options.sanitizers = nextVal().split(",").map((s) => s.trim());
    } else if (arg === "--filter") {
      testFilter = nextVal();
    } else if (arg === "--framework") {
      testFramework = nextVal();
    } else if (arg === "--no-rebuild") {
      testRebuild = false;
    } else if (arg === "-o" || arg === "--out") {
      options.output = nextVal();
    } else if (arg === "-t" || arg === "--target") {
      options.targetDir = nextVal();
    } else if (arg === "--objdir") {
      options.objectDir = nextVal();
    } else if (arg === "--bindir") {
      options.binDir = nextVal();
    } else if (arg === "-c" || arg === "--compiler") {
      options.compiler = nextVal();
    } else if (arg === "-s" || arg === "--std") {
      options.std = nextVal();
    } else if (arg === "--c-std") {
      options.cStandard = nextVal();
    } else if (arg === "-p" || arg === "--profile") {
      options.profile = nextVal();
    } else if (arg === "-O" || arg === "--opt") {
      options.optimization = nextVal();
    } else if (arg === "-W" || arg === "--warnings") {
      options.warnings = nextVal();
    } else if (arg === "-I" || arg === "--include") {
      options.includeDirs?.push(nextVal());
    } else if (arg === "-L" || arg === "--libdir") {
      options.libDirs?.push(nextVal());
    } else if (arg === "-l" || arg === "--lib") {
      options.libs?.push(nextVal());
    } else if (arg === "-D" || arg === "--define") {
      options.defines?.push(nextVal());
    } else if (arg === "-a" || arg === "--args") {
      const argVal = nextVal();
      if (argVal) {
        programArgs.push(...argVal.split(/\s+/).filter(Boolean));
      }
    } else if (arg === "-P" || arg === "--project") {
      projectName = nextVal();
    } else if (arg === "--zip") {
      packageZip = true;
    } else if (arg === "--dist-dir") {
      distDir = nextVal();
    } else if (arg === "-i" || arg === "--interactive" || arg === "--menu") {
      interactive = true;
    } else if (arg.startsWith("-I") && arg.length > 2) {
      options.includeDirs?.push(arg.slice(2));
    } else if (arg.startsWith("-D") && arg.length > 2) {
      options.defines?.push(arg.slice(2));
    } else if (arg.startsWith("-L") && arg.length > 2) {
      options.libDirs?.push(arg.slice(2));
    } else if (arg.startsWith("-l") && arg.length > 2 && arg[2] !== "-") {
      options.libs?.push(arg.slice(2));
    } else if (arg.startsWith("-")) {
      options.customFlags?.push(arg);
    } else {
      sources.push(arg);
    }
  }
  if (sources.length > 0) {
    options.sources = sources;
  }
  return { command, sources, programArgs, options, watchRun, verbose, testFilter, testFramework, testRebuild, projectName, packageZip, distDir, interactive };
}
async function showBuildMenu(parsed) {
  if (!process.stdin.isTTY) return false;
  const workingDir = parsed.options.workingDir || process.cwd();
  const workspace = discoverWorkspace(workingDir);
  if (workspace && workspace.projects.length > 0 && !parsed.projectName) {
    try {
      console.log();
      const projectOptions = [];
      if (parsed.command === "build" && workspace.projects.length > 1) {
        projectOptions.push({
          label: `${colors.bold("[All Projects]")}  ${colors.gray(`(${workspace.projects.length} targets)`)}`,
          value: "__ALL__",
          description: "Build all projects in workspace"
        });
      }
      for (const p of workspace.projects) {
        const tag = p.isRoot ? colors.cyan("[root]") : colors.gray(`[${p.relDir}]`);
        projectOptions.push({
          label: `${colors.bold(p.name)}  ${colors.gray(`(${p.config.type || "exe"})`)}  ${tag}`,
          value: p.name,
          description: p.config.description || `Location: ${p.relDir}`
        });
      }
      const selectedValue = await promptSelect({
        title: "Select Project",
        options: projectOptions,
        defaultIndex: 0
      });
      if (selectedValue === "__ALL__") {
        console.log(`  ${colors.green("\u2713")} ${colors.bold("All Projects")}
`);
        if (parsed.options.profile === void 0) {
          const profile = await promptSelect({
            title: "Build Configuration",
            options: PROFILES,
            defaultIndex: 0
          });
          parsed.options.profile = profile;
          console.log(`  ${colors.green("\u2713")} ${colors.bold(PROFILES.find((p) => p.value === profile)?.label ?? profile)}
`);
        }
        await handleWorkspace(parsed);
        return true;
      }
      const project = findProjectInWorkspace(workspace, selectedValue);
      parsed.projectName = project.name;
      parsed.options.workingDir = project.dir;
      parsed.options.type = project.config.type;
      parsed.options.std = project.config.std;
      console.log(`  ${colors.green("\u2713")} ${colors.bold(project.name)} ${colors.gray(`(${project.relDir})`)}
`);
      if (parsed.options.profile === void 0 && project.config.profile === void 0) {
        const profile = await promptSelect({
          title: "Build Configuration",
          options: PROFILES,
          defaultIndex: 0
        });
        parsed.options.profile = profile;
        console.log(`  ${colors.green("\u2713")} ${colors.bold(PROFILES.find((p) => p.value === profile)?.label ?? profile)}
`);
      }
    } catch (err) {
      if (err.message === "cancelled") {
        console.log(`
${badges.warn} Build cancelled.`);
        process.exit(0);
      }
      throw err;
    }
    return false;
  }
  const configFile = findConfigFile(workingDir);
  const fileConfig = configFile ? loadConfigFile(configFile) : null;
  const hasProfile = (parsed.options.profile !== void 0 || fileConfig?.profile !== void 0) && !parsed.interactive;
  if (hasProfile) return false;
  try {
    console.log();
    const profile = await promptSelect({
      title: "Build Configuration",
      options: PROFILES,
      defaultIndex: 0
    });
    parsed.options.profile = profile;
    console.log(`  ${colors.green("\u2713")} ${colors.bold(PROFILES.find((p) => p.value === profile)?.label ?? profile)}`);
    console.log();
  } catch (err) {
    if (err.message === "cancelled") {
      console.log(`
${badges.warn} Build cancelled.`);
      process.exit(0);
    }
    throw err;
  }
  return false;
}
async function handleListCompilers() {
  console.log(`${badges.cppc} Detecting available C++ compilers...`);
  const compilers = await detectAllCompilers();
  if (compilers.length === 0) {
    console.log(`${badges.warn} No C++ compilers found in system.`);
    return;
  }
  const defaultCompiler = await selectCompiler("auto");
  console.log(`
Found ${colors.bold(String(compilers.length))} compiler(s):`);
  for (const c of compilers) {
    const isDefault = c.type === defaultCompiler.type;
    const defaultTag = isDefault ? colors.green(" (Selected Default)") : "";
    console.log(`  ${colors.bold(colors.cyan("\u2022"))} ${colors.bold(c.name)}${defaultTag}`);
    console.log(`    Type:       ${c.type}`);
    console.log(`    Executable: ${c.executable}`);
    if (c.version) console.log(`    Version:    ${c.version}`);
    if (c.vcvarsPath) console.log(`    vcvars:     ${c.vcvarsPath}`);
    console.log();
  }
}
async function handleInit(parsed) {
  const isWorkspace = process.argv.includes("--workspace") || process.argv.includes("-w");
  if (isWorkspace) {
    const targetPath2 = path11.join(process.cwd(), WORKSPACE_FILE_NAME);
    if (fs11.existsSync(targetPath2)) {
      console.log(`${badges.warn} ${WORKSPACE_FILE_NAME} already exists in current directory.`);
      return;
    }
    fs11.writeFileSync(targetPath2, generateDefaultWorkspaceConfig(), "utf8");
    console.log(`${badges.success} Created ${colors.bold(WORKSPACE_FILE_NAME)}!`);
    return;
  }
  const targetPath = path11.join(process.cwd(), CONFIG_FILE_NAME);
  if (fs11.existsSync(targetPath)) {
    console.log(`${badges.warn} ${CONFIG_FILE_NAME} already exists in current directory.`);
    return;
  }
  fs11.writeFileSync(targetPath, generateDefaultConfig(), "utf8");
  console.log(`${badges.success} Created ${colors.bold(CONFIG_FILE_NAME)}!`);
}
async function handleWorkspace(parsed) {
  const workspace = discoverWorkspace(parsed.options.workingDir || process.cwd());
  if (!workspace) {
    console.log(`${badges.warn} No workspace found. Create a ${colors.yellow(WORKSPACE_FILE_NAME)} with ${colors.yellow('"projects": [...]')}.`);
    return;
  }
  console.log(`${badges.cppc} Workspace: ${colors.bold(workspace.config.name || path11.basename(workspace.rootDir))}`);
  console.log(`  Found ${colors.cyan(String(workspace.projects.length))} project(s)
`);
  const projectFilter = parsed.projectName;
  let projectsToBuild = workspace.projects;
  if (projectFilter) {
    const found = findProjectInWorkspace(workspace, projectFilter);
    if (found) {
      projectsToBuild = [found];
    } else {
      console.log(`${badges.warn} Project "${colors.yellow(projectFilter)}" not found in workspace.`);
      console.log(`  Available projects:`);
      for (const p of workspace.projects) {
        console.log(`    - ${colors.cyan(p.name)} (${p.relDir})`);
      }
      return;
    }
  }
  let allSuccess = true;
  const startTime = Date.now();
  let sortedProjects;
  try {
    sortedProjects = sortProjectsTopologically(projectsToBuild, workspace);
  } catch (err) {
    console.error(`${badges.error} ${err.message}`);
    process.exit(1);
  }
  for (const project of sortedProjects) {
    const projectType = project.config.type || "exe";
    const isHeaderOnly = projectType === "header-only";
    const loc = project.isRoot ? colors.cyan("[root]") : colors.gray(`[${project.relDir}]`);
    if (isHeaderOnly) {
      console.log(`${colors.bold(colors.cyan("\u25B8"))} ${colors.bold(project.name)} (${colors.green("header-only")}) ${loc} ${colors.gray("\u2014 skipped, no compilation needed")}`);
      continue;
    }
    console.log(`${colors.bold(colors.cyan("\u25B8"))} ${colors.bold(project.name)} (${projectType}) ${loc}`);
    const projectOptions = {
      ...parsed.options,
      workingDir: project.dir,
      name: project.name,
      type: project.config.type,
      sources: project.config.sources,
      output: project.config.output,
      std: project.config.std,
      profile: parsed.options.profile ?? project.config.profile,
      compiler: project.config.compiler,
      srcDir: project.config.srcDir,
      vendorDir: project.config.vendorDir,
      targetDir: project.config.targetDir,
      includeDirs: project.config.includeDirs,
      libDirs: project.config.libDirs,
      libs: project.config.libs,
      defines: project.config.defines,
      customFlags: project.config.customFlags,
      parallel: project.config.parallel,
      jobs: project.config.jobs,
      lto: project.config.lto,
      pch: project.config.pch,
      copyDlls: project.config.copyDlls,
      autoDiscoverVendor: project.config.autoDiscoverVendor
    };
    try {
      let result;
      if (project.config.dependsOn && project.config.dependsOn.length > 0) {
        result = await buildWithDependencies(project, workspace, projectOptions);
      } else {
        result = await compile(projectOptions);
      }
      if (parsed.verbose) {
        console.log(`  ${badges.info} Command: ${colors.gray(result.commandExecuted)}`);
      }
      logCompilerOutput(result.stdout, result.stderr);
      if (result.success) {
        console.log(`  ${badges.success} Built ${colors.green(formatDuration(result.durationMs))}
`);
      } else {
        allSuccess = false;
        console.error(`  ${badges.error} Build failed
`);
      }
    } catch (err) {
      allSuccess = false;
      console.error(`  ${badges.error} ${err.message}
`);
    }
  }
  const totalDuration = Date.now() - startTime;
  if (allSuccess) {
    console.log(`${badges.success} All ${colors.cyan(String(projectsToBuild.length))} project(s) built in ${colors.green(formatDuration(totalDuration))}`);
  } else {
    console.error(`${badges.error} Some projects failed to build`);
    process.exit(1);
  }
}
async function buildCurrentTarget(parsed) {
  const workingDir = parsed.options.workingDir || process.cwd();
  const workspace = discoverWorkspace(workingDir);
  let targetProject;
  if (workspace) {
    if (parsed.projectName) {
      targetProject = findProjectInWorkspace(workspace, parsed.projectName);
    } else {
      targetProject = workspace.projects.find((p) => p.dir === path11.resolve(workingDir));
    }
  }
  if (targetProject && workspace && targetProject.config.dependsOn && targetProject.config.dependsOn.length > 0) {
    return buildWithDependencies(targetProject, workspace, parsed.options, (p, isDep) => {
      if (isDep) {
        console.log(`  ${colors.bold(colors.cyan("\u25B8"))} Building dependency: ${colors.bold(p.name)} (${p.config.type || "static"})`);
      }
    });
  }
  return compile(parsed.options);
}
async function handleBuild(parsed) {
  console.log(`${badges.cppc} Compiling...`);
  const result = await buildCurrentTarget(parsed);
  if (parsed.verbose) {
    console.log(`${badges.info} Command: ${colors.gray(result.commandExecuted)}`);
  }
  logCompilerOutput(result.stdout, result.stderr);
  if (result.copiedDlls && result.copiedDlls.length > 0) {
    console.log(
      `${badges.info} Copied ${colors.cyan(String(result.copiedDlls.length))} runtime DLL(s): ${colors.gray(result.copiedDlls.join(", "))}`
    );
  }
  if (result.success) {
    const proj = result.projectInfo;
    const projDesc = proj?.name ? `${colors.bold(proj.name)}${proj.version ? ` v${proj.version}` : ""} (${proj.type || "executable"})` : colors.bold(path11.basename(result.executablePath));
    console.log(
      `${badges.success} Built ${projDesc} using ${colors.cyan(
        result.compiler.name
      )} in ${colors.green(formatDuration(result.durationMs))}`
    );
    return true;
  } else {
    console.error(
      `${badges.error} Compilation failed (${colors.red(formatDuration(result.durationMs))})`
    );
    return false;
  }
}
async function handleRun(parsed) {
  console.log(`${badges.cppc} Compiling...`);
  const compileResult = await buildCurrentTarget(parsed);
  if (parsed.verbose) {
    console.log(`${badges.info} Command: ${colors.gray(compileResult.commandExecuted)}`);
  }
  logCompilerOutput(compileResult.stdout, compileResult.stderr);
  if (compileResult.copiedDlls && compileResult.copiedDlls.length > 0) {
    console.log(
      `${badges.info} Copied ${colors.cyan(String(compileResult.copiedDlls.length))} runtime DLL(s): ${colors.gray(compileResult.copiedDlls.join(", "))}`
    );
  }
  if (!compileResult.success) {
    console.error(
      `${badges.error} Compilation failed (${colors.red(formatDuration(compileResult.durationMs))})`
    );
    process.exit(1);
  }
  const proj = compileResult.projectInfo;
  const projDesc = proj?.name ? `${colors.bold(proj.name)}${proj.version ? ` v${proj.version}` : ""} (${proj.type || "executable"})` : colors.bold(path11.basename(compileResult.executablePath));
  console.log(
    `${badges.success} Built ${projDesc} in ${colors.green(
      formatDuration(compileResult.durationMs)
    )}`
  );
  console.log(`${badges.run} Starting execution...
----------------------------------------`);
  const runResult = await runExecutable(compileResult.executablePath, {
    args: parsed.programArgs,
    vendorBinDirs: compileResult.vendorBinDirs
  });
  console.log(`----------------------------------------`);
  const codeStr = runResult.exitCode === 0 ? colors.green("0") : colors.red(String(runResult.exitCode));
  console.log(
    `${badges.run} Process exited with code ${codeStr} in ${colors.green(
      formatDuration(runResult.durationMs)
    )}`
  );
  if (runResult.exitCode !== null && runResult.exitCode !== 0) {
    process.exit(runResult.exitCode);
  }
}
async function handlePackage(parsed) {
  console.log(`${badges.cppc} Packaging project for distribution...`);
  try {
    const result = await packageProject({
      workingDir: parsed.options.workingDir,
      project: parsed.projectName,
      profile: parsed.options.profile || "release",
      compiler: parsed.options.compiler,
      distDir: parsed.distDir,
      zip: parsed.packageZip,
      clean: parsed.options.clean,
      verbose: parsed.verbose
    });
    console.log();
    console.log(`${badges.success} Package created: ${colors.bold(result.packageName)}`);
    console.log(`  Directory: ${colors.cyan(result.packageDir)}`);
    if (result.zipPath) {
      console.log(`  Archive:   ${colors.green(result.zipPath)}`);
    }
    console.log(`  Files included (${result.copiedFiles.length}):`);
    for (const f of result.copiedFiles) {
      console.log(`    ${colors.bold(colors.cyan("\u2022"))} ${colors.gray(f)}`);
    }
    console.log(`  Completed in ${colors.green(formatDuration(result.durationMs))}
`);
  } catch (err) {
    console.error(`${badges.error} Packaging failed: ${err.message}`);
    process.exit(1);
  }
}
async function handleTest(parsed) {
  console.log(`${badges.cppc} Running tests...`);
  const testSources = parsed.options.sources && parsed.options.sources.length > 0 ? parsed.options.sources : ["test/**/*.cpp", "tests/**/*.cpp", "*test*.cpp"];
  let framework = parsed.testFramework ?? "auto";
  let detectedFramework = "";
  if (framework === "auto") {
    const cwd = parsed.options.workingDir ?? process.cwd();
    try {
      const files = fs11.readdirSync(cwd, { recursive: true }).filter((f) => f.toString().endsWith(".cpp"));
      if (files.length > 0) {
        const content = fs11.readFileSync(path11.join(cwd, files[0]), "utf8");
        if (content.includes("gtest") || content.includes("TEST_F") || content.includes("TEST(")) {
          framework = "gtest";
          detectedFramework = "GoogleTest";
        } else if (content.includes("catch2") || content.includes("CATCH")) {
          framework = "catch2";
          detectedFramework = "Catch2";
        } else if (content.includes("doctest") || content.includes("DOCTEST")) {
          framework = "doctest";
          detectedFramework = "doctest";
        }
      }
    } catch {
    }
  }
  if (framework === "auto") {
    framework = "gtest";
    detectedFramework = "GoogleTest";
  }
  if (!detectedFramework) {
    detectedFramework = framework === "gtest" ? "GoogleTest" : framework === "catch2" ? "Catch2" : "doctest";
  }
  console.log(`${badges.info} Framework: ${colors.cyan(detectedFramework)}`);
  const testOptions = {
    ...parsed.options,
    sources: testSources,
    name: "test_runner"
  };
  if (parsed.testRebuild !== false) {
    console.log(`${badges.cppc} Compiling tests...`);
    const compileResult = await compile(testOptions);
    if (parsed.verbose) {
      console.log(`${badges.info} Command: ${colors.gray(compileResult.commandExecuted)}`);
    }
    logCompilerOutput(compileResult.stdout, compileResult.stderr);
    if (!compileResult.success) {
      console.error(
        `${badges.error} Test compilation failed (${colors.red(formatDuration(compileResult.durationMs))})`
      );
      process.exit(1);
    }
    console.log(
      `${badges.success} Tests compiled in ${colors.green(formatDuration(compileResult.durationMs))}`
    );
  }
  const testExe = path11.resolve(
    parsed.options.workingDir ?? process.cwd(),
    parsed.options.binDir ?? "target/bin",
    process.platform === "win32" ? "test_runner.exe" : "test_runner"
  );
  if (!fs11.existsSync(testExe)) {
    console.error(`${badges.error} Test executable not found: ${testExe}`);
    process.exit(1);
  }
  const testArgs = [];
  if (parsed.testFilter) {
    if (framework === "gtest") {
      testArgs.push(`--gtest_filter=${parsed.testFilter}`);
    } else if (framework === "catch2") {
      testArgs.push(parsed.testFilter);
    } else if (framework === "doctest") {
      testArgs.push(`-tc=${parsed.testFilter}`);
    }
  }
  if (parsed.verbose) {
    if (framework === "gtest") {
      testArgs.push("--gtest_print_time=1");
    }
  }
  console.log(`
----------------------------------------`);
  const startTime = Date.now();
  const runResult = await runExecutable(testExe, {
    args: [...testArgs, ...parsed.programArgs]
  });
  const durationMs = Date.now() - startTime;
  console.log(`----------------------------------------`);
  const codeStr = runResult.exitCode === 0 ? colors.green("0") : colors.red(String(runResult.exitCode));
  console.log(
    `${badges.run} Tests exited with code ${codeStr} in ${colors.green(formatDuration(durationMs))}`
  );
  if (runResult.exitCode !== null && runResult.exitCode !== 0) {
    process.exit(runResult.exitCode);
  }
}
async function handleWatch(parsed) {
  console.log(`${badges.watch} Starting watch mode...`);
  const targets = parsed.sources.length > 0 ? parsed.sources : [process.cwd()];
  let isBuilding = false;
  const executeCycle = async (fileChanged) => {
    if (isBuilding) return;
    isBuilding = true;
    try {
      if (fileChanged) {
        console.log(`
${badges.watch} Change detected in ${colors.cyan(path11.basename(fileChanged))}`);
      }
      if (parsed.watchRun || parsed.command === "run") {
        const compileResult = await compile(parsed.options);
        logCompilerOutput(compileResult.stdout, compileResult.stderr);
        if (compileResult.success) {
          console.log(
            `${badges.success} Rebuilt in ${colors.green(formatDuration(compileResult.durationMs))}`
          );
          console.log(`${badges.run} Starting execution...
----------------------------------------`);
          const runResult = await runExecutable(compileResult.executablePath, {
            args: parsed.programArgs,
            vendorBinDirs: compileResult.vendorBinDirs
          });
          console.log(`----------------------------------------`);
          const codeStr = runResult.exitCode === 0 ? colors.green("0") : colors.red(String(runResult.exitCode));
          console.log(
            `${badges.run} Process exited with code ${codeStr} in ${colors.green(
              formatDuration(runResult.durationMs)
            )}`
          );
        } else {
          console.error(`${badges.error} Rebuild failed.`);
        }
      } else {
        const success = await handleBuild(parsed);
        if (success) {
          console.log(`${badges.watch} Waiting for changes...`);
        }
      }
    } catch (err) {
      console.error(`${badges.error} ${err.message}`);
    } finally {
      isBuilding = false;
    }
  };
  await executeCycle();
  const watcher = new FileWatcher({
    targets,
    onChange: (changed) => executeCycle(changed)
  });
  watcher.start();
  console.log(`${badges.watch} Watching for file changes. Press Ctrl+C to exit.
`);
}
async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  try {
    const workspace = discoverWorkspace(parsed.options.workingDir || process.cwd());
    if (parsed.projectName && workspace) {
      const proj = findProjectInWorkspace(workspace, parsed.projectName);
      if (proj) {
        parsed.projectName = proj.name;
        parsed.options.workingDir = proj.dir;
        if (!parsed.options.type) parsed.options.type = proj.config.type;
        if (!parsed.options.std) parsed.options.std = proj.config.std;
      } else {
        console.error(`${badges.error} Project "${parsed.projectName}" not found in workspace.`);
        console.log(`  Available projects:`);
        for (const p of workspace.projects) {
          console.log(`    - ${colors.cyan(p.name)} (${p.relDir})`);
        }
        process.exit(1);
      }
    }
    switch (parsed.command) {
      case "help":
        console.log(HELP_TEXT);
        break;
      case "version":
        console.log("Sugar++ v2.0.0 (spp / s++)");
        break;
      case "list-compilers":
        await handleListCompilers();
        break;
      case "init":
        await handleInit(parsed);
        break;
      case "workspace":
        await handleWorkspace(parsed);
        break;
      case "watch":
        await handleWatch(parsed);
        break;
      case "test":
        await handleTest(parsed);
        break;
      case "run": {
        const handled = await showBuildMenu(parsed);
        if (handled) break;
        await handleRun(parsed);
        break;
      }
      case "package": {
        const handled = await showBuildMenu(parsed);
        if (handled) break;
        await handlePackage(parsed);
        break;
      }
      case "build":
      default: {
        const handled = await showBuildMenu(parsed);
        if (handled) break;
        const success = await handleBuild(parsed);
        if (!success) {
          process.exit(1);
        }
        break;
      }
    }
  } catch (err) {
    console.error(`${badges.error} ${err.message}`);
    process.exit(1);
  }
}
main();
