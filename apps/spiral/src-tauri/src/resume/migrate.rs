#[cfg(test)]
use std::collections::BTreeMap;
use std::fs::{self, File, OpenOptions};
use std::io::{self, ErrorKind};
#[cfg(test)]
use std::path::Component;
use std::path::{Path, PathBuf};

use resume_proto::ModelRefs;
use serde::Deserialize;

use crate::paths::{LegacyRoots, Root};

const CATALOGUE: &str = include_str!("../../assets/model-catalogue.json");

#[derive(Debug)]
pub enum MigrateError {
    BenchRefused,
    Io(io::Error),
}

impl std::fmt::Display for MigrateError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::BenchRefused => {
                formatter.write_str("Resume data was not moved. The benchmark is pointed at the installed Resume folder.")
            }
            Self::Io(err) => write!(formatter, "Could not move the resume: {err}."),
        }
    }
}

impl From<io::Error> for MigrateError {
    fn from(err: io::Error) -> Self {
        Self::Io(err)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FileOutcome {
    Absent,
    Moved,
    Identical,
    Conflict,
    RecoveredTemp,
    LeftTemp,
    Busy,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ModelOutcome {
    Absent,
    Moved,
    Referenced { count: usize },
    Already,
    Busy,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Report {
    pub resume: FileOutcome,
    pub engine: FileOutcome,
    pub models: ModelOutcome,
    pub copied_model_bytes: u64,
}

pub fn resolve_bench_legacy(
    explicit: Option<&Path>,
    isolated: &Path,
    real: &Path,
) -> Result<PathBuf, MigrateError> {
    let chosen = explicit.unwrap_or(isolated);
    if same_dir(chosen, real) {
        Err(MigrateError::BenchRefused)
    } else {
        Ok(chosen.to_path_buf())
    }
}

pub fn adopt_app(root: &Root, real: &LegacyRoots) -> Result<Report, MigrateError> {
    let _lock = MigrationLock::acquire(&root.lock_file())?;
    let bench = std::env::var("SPIRAL_BENCH").ok().as_deref() == Some("1");
    let legacy = if bench {
        let explicit = std::env::var_os("SPIRAL_LEGACY_RESUME").map(PathBuf::from);
        let isolated = root.dir().join("bench-legacy");
        fs::create_dir_all(&isolated)?;
        resolve_bench_legacy(explicit.as_deref(), &isolated, real.dir())?
    } else {
        real.dir().to_path_buf()
    };
    let mut fs = OsFs { copied: 0 };
    adopt(&mut fs, &root.resume_dir(), &legacy, bench, real.dir())
}

pub fn adopt(
    fs: &mut impl Fs,
    dest: &Path,
    legacy: &Path,
    bench: bool,
    real_legacy: &Path,
) -> Result<Report, MigrateError> {
    if bench && same_dir(legacy, real_legacy) {
        return Err(MigrateError::BenchRefused);
    }
    fs.create_dir_all(dest)?;
    let resume = adopt_doc(fs, &legacy.join("resume.json"), &dest.join("resume.json"))?;
    let engine = adopt_doc(fs, &legacy.join("engine.json"), &dest.join("engine.json"))?;
    let resume = match resume {
        FileOutcome::Absent => adopt_temp(
            fs,
            &legacy.join("resume.json.tmp"),
            &dest.join("resume.json"),
        )?,
        other => other,
    };
    let models = adopt_models(fs, &legacy.join("models"), dest)?;
    Ok(Report {
        resume,
        engine,
        models,
        copied_model_bytes: fs.copied_bytes(),
    })
}

fn adopt_doc(fs: &mut impl Fs, from: &Path, to: &Path) -> Result<FileOutcome, MigrateError> {
    let source = fs.is_file(from);
    let dest = fs.is_file(to);
    match (dest, source) {
        (_, false) => Ok(FileOutcome::Absent),
        (false, true) => {
            if let Some(parent) = to.parent() {
                fs.create_dir_all(parent)?;
            }
            match relocate_file(fs, from, to) {
                Ok(()) => Ok(FileOutcome::Moved),
                Err(err) if sharing_violation(&err) => Ok(FileOutcome::Busy),
                Err(err) => Err(err.into()),
            }
        }
        (true, true) => {
            let left = match fs.read(to) {
                Ok(bytes) => bytes,
                Err(err) if sharing_violation(&err) => return Ok(FileOutcome::Busy),
                Err(err) => return Err(err.into()),
            };
            let right = match fs.read(from) {
                Ok(bytes) => bytes,
                Err(err) if sharing_violation(&err) => return Ok(FileOutcome::Busy),
                Err(err) => return Err(err.into()),
            };
            if left == right {
                match fs.remove_file(from) {
                    Ok(()) => Ok(FileOutcome::Identical),
                    Err(err) if sharing_violation(&err) => Ok(FileOutcome::Busy),
                    Err(err) => Err(err.into()),
                }
            } else {
                Ok(FileOutcome::Conflict)
            }
        }
    }
}

fn adopt_temp(fs: &mut impl Fs, tmp: &Path, dest: &Path) -> Result<FileOutcome, MigrateError> {
    if fs.is_file(dest) || !fs.is_file(tmp) {
        return Ok(FileOutcome::Absent);
    }
    let bytes = fs.read(tmp)?;
    if serde_json::from_slice::<serde_json::Map<String, serde_json::Value>>(&bytes).is_err() {
        return Ok(FileOutcome::LeftTemp);
    }
    if let Some(parent) = dest.parent() {
        fs.create_dir_all(parent)?;
    }
    match relocate_file(fs, tmp, dest) {
        Ok(()) => Ok(FileOutcome::RecoveredTemp),
        Err(err) if sharing_violation(&err) => Ok(FileOutcome::Busy),
        Err(err) => Err(err.into()),
    }
}

fn relocate_file(fs: &mut impl Fs, from: &Path, to: &Path) -> io::Result<()> {
    match fs.rename_file(from, to) {
        Ok(()) => Ok(()),
        Err(err) if err.kind() == ErrorKind::CrossesDevices => {
            let bytes = fs.read(from)?;
            let name = to
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("file");
            let tmp = to.with_file_name(format!(".{name}.moving"));
            fs.write(&tmp, &bytes)?;
            fs.sync_file(&tmp)?;
            fs.rename_file(&tmp, to)?;
            fs.remove_file(from)?;
            Ok(())
        }
        Err(err) => Err(err),
    }
}

fn adopt_models(
    fs: &mut impl Fs,
    legacy: &Path,
    dest: &Path,
) -> Result<ModelOutcome, MigrateError> {
    let dest_models = dest.join("models");
    let refs = dest.join("models.ref.json");
    if !fs.is_dir(legacy) {
        return Ok(ModelOutcome::Absent);
    }
    if fs.is_file(&refs) && !fs.is_dir(&dest_models) && valid_refs(fs, &refs) {
        let count = fs
            .read(&refs)
            .ok()
            .and_then(|bytes| serde_json::from_slice::<ModelRefs>(&bytes).ok())
            .map(|parsed| parsed.models.len())
            .unwrap_or(0);
        return Ok(ModelOutcome::Referenced { count });
    }
    if fs.is_dir(&dest_models) {
        return merge_models(fs, legacy, &dest_models, &refs);
    }
    match fs.rename_dir(legacy, &dest_models) {
        Ok(()) => Ok(ModelOutcome::Moved),
        Err(err) if err.kind() == ErrorKind::CrossesDevices => {
            let files = fs.files_in(legacy)?;
            let models = model_refs(&files);
            write_refs(fs, &refs, &models)?;
            Ok(ModelOutcome::Referenced { count: files.len() })
        }
        Err(err) if sharing_violation(&err) => Ok(ModelOutcome::Busy),
        Err(err) => Err(err.into()),
    }
}

fn merge_models(
    fs: &mut impl Fs,
    legacy: &Path,
    dest_models: &Path,
    refs: &Path,
) -> Result<ModelOutcome, MigrateError> {
    let mut moved = 0usize;
    let mut referenced = Vec::new();
    let mut busy = false;
    for path in fs.files_in(legacy)? {
        let Some(name) = path
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
        else {
            continue;
        };
        let target = dest_models.join(&name);
        if fs.is_file(&target) {
            if fs.file_len(&path)? == fs.file_len(&target)? {
                continue;
            }
            match fs.remove_file(&target) {
                Ok(()) => {}
                Err(err) if sharing_violation(&err) => {
                    busy = true;
                    continue;
                }
                Err(err) => return Err(err.into()),
            }
        }
        match fs.rename_file(&path, &target) {
            Ok(()) => moved += 1,
            Err(err) if err.kind() == ErrorKind::CrossesDevices => {
                referenced.push(resume_proto::ModelRef {
                    id: model_id(&name),
                    path: path.display().to_string(),
                })
            }
            Err(err) if sharing_violation(&err) => busy = true,
            Err(err) => return Err(err.into()),
        }
    }
    if !referenced.is_empty() {
        store_refs(fs, refs, &referenced)?;
    }
    if busy && moved == 0 && referenced.is_empty() {
        return Ok(ModelOutcome::Busy);
    }
    if !referenced.is_empty() && moved == 0 {
        return Ok(ModelOutcome::Referenced {
            count: referenced.len(),
        });
    }
    if moved == 0 {
        Ok(ModelOutcome::Already)
    } else {
        Ok(ModelOutcome::Moved)
    }
}

fn model_refs(files: &[PathBuf]) -> Vec<resume_proto::ModelRef> {
    files
        .iter()
        .filter_map(|path| {
            let name = path.file_name()?.to_string_lossy();
            Some(resume_proto::ModelRef {
                id: model_id(&name),
                path: path.display().to_string(),
            })
        })
        .collect()
}

fn valid_refs(fs: &impl Fs, path: &Path) -> bool {
    fs.read(path)
        .ok()
        .and_then(|bytes| serde_json::from_slice::<ModelRefs>(&bytes).ok())
        .is_some()
}

fn load_refs(fs: &impl Fs, path: &Path) -> Vec<resume_proto::ModelRef> {
    if !fs.is_file(path) || !valid_refs(fs, path) {
        return Vec::new();
    }
    fs.read(path)
        .ok()
        .and_then(|bytes| serde_json::from_slice::<ModelRefs>(&bytes).ok())
        .map(|parsed| parsed.models)
        .unwrap_or_default()
}

fn store_refs(fs: &mut impl Fs, path: &Path, extra: &[resume_proto::ModelRef]) -> io::Result<()> {
    let mut models = load_refs(fs, path);
    for model in extra {
        if let Some(found) = models.iter_mut().find(|item| item.id == model.id) {
            found.path = model.path.clone();
        } else {
            models.push(model.clone());
        }
    }
    write_refs(fs, path, &models)
}

fn write_refs(fs: &mut impl Fs, path: &Path, models: &[resume_proto::ModelRef]) -> io::Result<()> {
    let body = serde_json::to_vec_pretty(&ModelRefs {
        models: models.to_vec(),
    })
    .map_err(|err| io::Error::new(ErrorKind::InvalidData, err))?;
    let tmp = path.with_extension("json.tmp");
    fs.write(&tmp, &body)?;
    fs.sync_file(&tmp)?;
    fs.rename_file(&tmp, path)?;
    Ok(())
}

fn model_id(file_name: &str) -> String {
    #[derive(Deserialize)]
    struct File {
        models: Vec<Model>,
    }
    #[derive(Deserialize)]
    struct Model {
        id: String,
        file: String,
    }
    serde_json::from_str::<File>(CATALOGUE)
        .ok()
        .and_then(|file| {
            file.models
                .into_iter()
                .find(|model| model.file == file_name)
                .map(|model| model.id)
        })
        .unwrap_or_else(|| file_name.to_string())
}

fn same_dir(left: &Path, right: &Path) -> bool {
    if left == right {
        return true;
    }
    match (left.canonicalize(), right.canonicalize()) {
        (Ok(left), Ok(right)) => left == right,
        _ => false,
    }
}

pub trait Fs {
    fn is_file(&self, path: &Path) -> bool;
    fn is_dir(&self, path: &Path) -> bool;
    fn read(&self, path: &Path) -> io::Result<Vec<u8>>;
    fn write(&mut self, path: &Path, bytes: &[u8]) -> io::Result<()>;
    fn remove_file(&mut self, path: &Path) -> io::Result<()>;
    fn create_dir_all(&mut self, path: &Path) -> io::Result<()>;
    fn rename_file(&mut self, from: &Path, to: &Path) -> io::Result<()>;
    fn rename_dir(&mut self, from: &Path, to: &Path) -> io::Result<()>;
    fn files_in(&self, dir: &Path) -> io::Result<Vec<PathBuf>>;
    fn file_len(&self, path: &Path) -> io::Result<u64>;
    fn sync_file(&mut self, path: &Path) -> io::Result<()>;
    fn copied_bytes(&self) -> u64;
}

pub struct OsFs {
    copied: u64,
}

impl Fs for OsFs {
    fn is_file(&self, path: &Path) -> bool {
        path.is_file()
    }

    fn is_dir(&self, path: &Path) -> bool {
        path.is_dir()
    }

    fn read(&self, path: &Path) -> io::Result<Vec<u8>> {
        fs::read(path)
    }

    fn write(&mut self, path: &Path, bytes: &[u8]) -> io::Result<()> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(path, bytes)
    }

    fn remove_file(&mut self, path: &Path) -> io::Result<()> {
        fs::remove_file(path)
    }

    fn create_dir_all(&mut self, path: &Path) -> io::Result<()> {
        fs::create_dir_all(path)
    }

    fn rename_file(&mut self, from: &Path, to: &Path) -> io::Result<()> {
        map_cross_device(fs::rename(from, to))
    }

    fn rename_dir(&mut self, from: &Path, to: &Path) -> io::Result<()> {
        map_cross_device(fs::rename(from, to))
    }

    fn files_in(&self, dir: &Path) -> io::Result<Vec<PathBuf>> {
        let mut files = Vec::new();
        for entry in fs::read_dir(dir)? {
            let entry = entry?;
            if entry.file_type()?.is_file() {
                files.push(entry.path());
            }
        }
        files.sort();
        Ok(files)
    }

    fn file_len(&self, path: &Path) -> io::Result<u64> {
        Ok(fs::metadata(path)?.len())
    }

    fn sync_file(&mut self, path: &Path) -> io::Result<()> {
        fs::File::open(path)?.sync_all()
    }

    fn copied_bytes(&self) -> u64 {
        self.copied
    }
}

fn map_cross_device(result: io::Result<()>) -> io::Result<()> {
    match result {
        Ok(()) => Ok(()),
        Err(err) if crosses_devices(&err) => Err(io::Error::new(ErrorKind::CrossesDevices, err)),
        Err(err) => Err(err),
    }
}

fn sharing_violation(err: &io::Error) -> bool {
    err.raw_os_error() == Some(32)
}

fn crosses_devices(err: &io::Error) -> bool {
    if err.kind() == ErrorKind::CrossesDevices {
        return true;
    }
    match err.raw_os_error() {
        #[cfg(unix)]
        Some(18) => true,
        #[cfg(windows)]
        Some(17) => true,
        _ => false,
    }
}

#[cfg(test)]
#[derive(Clone, Debug)]
enum Node {
    File(Vec<u8>),
    Dir,
}

#[cfg(test)]
pub struct MemFs {
    nodes: BTreeMap<String, Node>,
    cross_dir: bool,
    busy: bool,
    pub copied: u64,
    fail_rename_at: Option<u32>,
    renames: u32,
}

#[cfg(test)]
impl MemFs {
    pub fn new() -> Self {
        Self {
            nodes: BTreeMap::new(),
            cross_dir: false,
            busy: false,
            copied: 0,
            fail_rename_at: None,
            renames: 0,
        }
    }

    pub fn cross_devices(mut self) -> Self {
        self.cross_dir = true;
        self
    }

    pub fn sharing_violation(mut self) -> Self {
        self.busy = true;
        self
    }

    pub fn fail_rename_at(mut self, n: u32) -> Self {
        self.fail_rename_at = Some(n);
        self
    }

    pub fn file(&mut self, path: &Path, bytes: &[u8]) {
        if let Some(parent) = path.parent() {
            self.create_dir_all(parent).expect("parent");
        }
        self.nodes.insert(key(path), Node::File(bytes.to_vec()));
    }

    pub fn dir(&mut self, path: &Path) {
        self.create_dir_all(path).expect("dir");
    }

    pub fn copy_file(&mut self, from: &Path, to: &Path) -> io::Result<u64> {
        let bytes = self.read(from)?;
        let len = bytes.len() as u64;
        self.write(to, &bytes)?;
        self.copied += len;
        Ok(len)
    }
}

#[cfg(test)]
impl Fs for MemFs {
    fn is_file(&self, path: &Path) -> bool {
        matches!(self.nodes.get(&key(path)), Some(Node::File(_)))
    }

    fn is_dir(&self, path: &Path) -> bool {
        matches!(self.nodes.get(&key(path)), Some(Node::Dir))
    }

    fn read(&self, path: &Path) -> io::Result<Vec<u8>> {
        match self.nodes.get(&key(path)) {
            Some(Node::File(bytes)) => Ok(bytes.clone()),
            _ => Err(io::Error::new(ErrorKind::NotFound, "missing file")),
        }
    }

    fn write(&mut self, path: &Path, bytes: &[u8]) -> io::Result<()> {
        if let Some(parent) = path.parent() {
            self.create_dir_all(parent)?;
        }
        self.nodes.insert(key(path), Node::File(bytes.to_vec()));
        Ok(())
    }

    fn remove_file(&mut self, path: &Path) -> io::Result<()> {
        match self.nodes.remove(&key(path)) {
            Some(Node::File(_)) => Ok(()),
            _ => Err(io::Error::new(ErrorKind::NotFound, "missing file")),
        }
    }

    fn create_dir_all(&mut self, path: &Path) -> io::Result<()> {
        let mut built = PathBuf::new();
        for component in path.components() {
            built.push(component);
            if matches!(component, Component::RootDir | Component::Prefix(_)) {
                continue;
            }
            let name = key(&built);
            self.nodes.entry(name).or_insert(Node::Dir);
        }
        Ok(())
    }

    fn rename_file(&mut self, from: &Path, to: &Path) -> io::Result<()> {
        self.renames += 1;
        if self.busy {
            return Err(io::Error::from_raw_os_error(32));
        }
        if self.fail_rename_at == Some(self.renames) {
            return Err(io::Error::new(ErrorKind::Interrupted, "crash"));
        }
        if self.cross_dir && from.parent() != to.parent() {
            return Err(io::Error::new(
                ErrorKind::CrossesDevices,
                "cross-device rename",
            ));
        }
        let bytes = self.read(from)?;
        self.write(to, &bytes)?;
        self.remove_file(from)?;
        Ok(())
    }

    fn rename_dir(&mut self, from: &Path, to: &Path) -> io::Result<()> {
        if self.busy {
            return Err(io::Error::from_raw_os_error(32));
        }
        if self.cross_dir {
            return Err(io::Error::new(
                ErrorKind::CrossesDevices,
                "cross-device rename",
            ));
        }
        let prefix = key(from);
        let dest = key(to);
        let moved = self
            .nodes
            .range(prefix.clone()..)
            .take_while(|(name, _)| {
                name.as_str() == prefix || name.starts_with(&(prefix.clone() + "/"))
            })
            .map(|(name, node)| (name.clone(), node.clone()))
            .collect::<Vec<_>>();
        if moved.is_empty() {
            return Err(io::Error::new(ErrorKind::NotFound, "missing directory"));
        }
        for (name, _) in &moved {
            self.nodes.remove(name);
        }
        for (name, node) in moved {
            let rest = name.trim_start_matches(&prefix);
            let next = if rest.is_empty() {
                dest.clone()
            } else {
                format!("{dest}{rest}")
            };
            self.nodes.insert(next, node);
        }
        Ok(())
    }

    fn files_in(&self, dir: &Path) -> io::Result<Vec<PathBuf>> {
        let prefix = key(dir);
        let mut files = Vec::new();
        for (name, node) in &self.nodes {
            if !matches!(node, Node::File(_)) {
                continue;
            }
            let Some(rest) = name.strip_prefix(&prefix) else {
                continue;
            };
            let rest = rest.strip_prefix('/').unwrap_or(rest);
            if rest.is_empty() || rest.contains('/') {
                continue;
            }
            files.push(PathBuf::from(name));
        }
        files.sort();
        Ok(files)
    }

    fn file_len(&self, path: &Path) -> io::Result<u64> {
        match self.nodes.get(&key(path)) {
            Some(Node::File(bytes)) => Ok(bytes.len() as u64),
            _ => Err(io::Error::new(ErrorKind::NotFound, "missing file")),
        }
    }

    fn sync_file(&mut self, _path: &Path) -> io::Result<()> {
        Ok(())
    }

    fn copied_bytes(&self) -> u64 {
        self.copied
    }
}

#[cfg(test)]
fn key(path: &Path) -> String {
    let text = path.to_string_lossy().replace('\\', "/");
    let absolute = text.starts_with('/');
    let mut parts = Vec::new();
    for part in text.split('/') {
        match part {
            "" | "." => {}
            ".." => {
                parts.pop();
            }
            other => parts.push(other),
        }
    }
    let joined = parts.join("/");
    if absolute {
        format!("/{joined}")
    } else {
        joined
    }
}

pub struct MigrationLock {
    file: File,
}

impl MigrationLock {
    pub fn acquire(path: &Path) -> io::Result<Self> {
        Self::open(path, false)
    }

    #[cfg(test)]
    pub fn try_acquire(path: &Path) -> io::Result<Self> {
        Self::open(path, true)
    }

    fn open(path: &Path, nonblock: bool) -> io::Result<Self> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        let file = OpenOptions::new()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            .open(path)?;
        lock_file(&file, nonblock)?;
        Ok(Self { file })
    }
}

impl Drop for MigrationLock {
    fn drop(&mut self) {
        unlock_file(&self.file);
    }
}

fn lock_file(file: &File, nonblock: bool) -> io::Result<()> {
    #[cfg(unix)]
    {
        use std::os::unix::io::AsRawFd;
        let mut op = 2;
        if nonblock {
            op |= 4;
        }
        let rc = unsafe { flock(file.as_raw_fd(), op) };
        if rc == 0 {
            Ok(())
        } else {
            let err = io::Error::last_os_error();
            if nonblock {
                Err(io::Error::new(ErrorKind::WouldBlock, err))
            } else {
                Err(err)
            }
        }
    }
    #[cfg(windows)]
    {
        use std::os::windows::io::AsRawHandle;
        let mut flags = 0x2u32;
        if nonblock {
            flags |= 0x1;
        }
        let mut overlapped: windows_sys::Win32::System::IO::OVERLAPPED =
            unsafe { std::mem::zeroed() };
        let rc = unsafe {
            windows_sys::Win32::Storage::FileSystem::LockFileEx(
                file.as_raw_handle(),
                flags,
                0,
                u32::MAX,
                u32::MAX,
                &mut overlapped,
            )
        };
        if rc == 0 {
            let err = io::Error::last_os_error();
            if nonblock {
                Err(io::Error::new(ErrorKind::WouldBlock, err))
            } else {
                Err(err)
            }
        } else {
            Ok(())
        }
    }
    #[cfg(not(any(unix, windows)))]
    {
        let _ = (file, nonblock);
        Ok(())
    }
}

fn unlock_file(file: &File) {
    #[cfg(unix)]
    {
        use std::os::unix::io::AsRawFd;
        unsafe { flock(file.as_raw_fd(), 8) };
    }
    #[cfg(windows)]
    {
        use std::os::windows::io::AsRawHandle;
        let mut overlapped: windows_sys::Win32::System::IO::OVERLAPPED =
            unsafe { std::mem::zeroed() };
        unsafe {
            windows_sys::Win32::Storage::FileSystem::UnlockFileEx(
                file.as_raw_handle(),
                0,
                u32::MAX,
                u32::MAX,
                &mut overlapped,
            );
        }
    }
    #[cfg(not(any(unix, windows)))]
    {
        let _ = file;
    }
}

#[cfg(unix)]
unsafe extern "C" {
    fn flock(fd: i32, op: i32) -> i32;
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dest() -> PathBuf {
        PathBuf::from("/spiral/resume")
    }

    fn legacy() -> PathBuf {
        PathBuf::from("/legacy")
    }

    #[test]
    fn an_exdev_model_move_writes_refs_and_copies_zero_bytes() {
        let mut fs = MemFs::new().cross_devices();
        fs.dir(&legacy().join("models"));
        fs.file(&legacy().join("models/one.gguf"), b"one-model-bytes");
        fs.file(&legacy().join("models/two.gguf"), b"two-model-bytes");
        let report = adopt(&mut fs, &dest(), &legacy(), false, Path::new("/real")).unwrap();
        assert_eq!(report.models, ModelOutcome::Referenced { count: 2 });
        assert_eq!(report.copied_model_bytes, 0);
        assert_eq!(fs.copied_bytes(), 0);
        assert!(!fs.is_file(&dest().join("models/one.gguf")));
        assert_eq!(
            fs.read(&legacy().join("models/one.gguf")).unwrap(),
            b"one-model-bytes"
        );
        assert_eq!(
            fs.read(&legacy().join("models/two.gguf")).unwrap(),
            b"two-model-bytes"
        );
        let refs: ModelRefs =
            serde_json::from_slice(&fs.read(&dest().join("models.ref.json")).unwrap()).unwrap();
        assert_eq!(refs.models.len(), 2);
        assert!(refs.models.iter().any(|model| model.id == "one.gguf"));
        assert!(refs
            .models
            .iter()
            .any(|model| model.path.ends_with("two.gguf")));
        assert!(!fs.is_file(&dest().join("models.ref.json.tmp")));
        let raw = String::from_utf8(fs.read(&dest().join("models.ref.json")).unwrap()).unwrap();
        assert!(!raw.contains("\"dirs\""));
    }

    #[test]
    fn a_cross_device_document_arrives_through_a_temp_file() {
        let mut fs = MemFs::new().cross_devices();
        fs.file(&legacy().join("resume.json"), br#"{"doc":{}}"#);
        let report = adopt(&mut fs, &dest(), &legacy(), false, Path::new("/real")).unwrap();
        assert_eq!(report.resume, FileOutcome::Moved);
        assert_eq!(
            fs.read(&dest().join("resume.json")).unwrap(),
            br#"{"doc":{}}"#
        );
        assert!(!fs.is_file(&legacy().join("resume.json")));
        assert!(!fs.is_file(&dest().join(".resume.json.moving")));
    }

    #[test]
    fn an_existing_model_folder_is_merged_by_name_and_size() {
        let mut fs = MemFs::new();
        fs.dir(&dest().join("models"));
        fs.file(&dest().join("models/one.gguf"), b"one");
        fs.file(&legacy().join("models/one.gguf"), b"one");
        fs.file(&legacy().join("models/two.gguf"), b"two");
        let report = adopt(&mut fs, &dest(), &legacy(), false, Path::new("/real")).unwrap();
        assert_eq!(report.models, ModelOutcome::Moved);
        assert_eq!(fs.read(&dest().join("models/one.gguf")).unwrap(), b"one");
        assert_eq!(fs.read(&dest().join("models/two.gguf")).unwrap(), b"two");
        assert_eq!(report.copied_model_bytes, 0);
    }

    #[test]
    fn a_shorter_model_with_the_same_name_is_replaced() {
        let mut fs = MemFs::new();
        fs.dir(&dest().join("models"));
        fs.file(&dest().join("models/one.gguf"), b"short");
        fs.file(&legacy().join("models/one.gguf"), b"the full model");
        let report = adopt(&mut fs, &dest(), &legacy(), false, Path::new("/real")).unwrap();
        assert_eq!(report.models, ModelOutcome::Moved);
        assert_eq!(
            fs.read(&dest().join("models/one.gguf")).unwrap(),
            b"the full model"
        );
        assert!(!fs.is_file(&legacy().join("models/one.gguf")));
    }

    #[test]
    fn new_model_refs_are_merged_into_the_existing_list() {
        let mut fs = MemFs::new().cross_devices();
        fs.dir(&dest().join("models"));
        fs.file(&dest().join("models/keep.gguf"), b"keep");
        fs.file(&legacy().join("models/extra.gguf"), b"extra");
        fs.file(
            &dest().join("models.ref.json"),
            br#"{"models":[{"id":"old","path":"/legacy/old.gguf"}]}"#,
        );
        let report = adopt(&mut fs, &dest(), &legacy(), false, Path::new("/real")).unwrap();
        assert!(matches!(
            report.models,
            ModelOutcome::Referenced { count: 1 }
        ));
        let refs: ModelRefs =
            serde_json::from_slice(&fs.read(&dest().join("models.ref.json")).unwrap()).unwrap();
        assert!(refs.models.iter().any(|model| model.id == "old"));
        assert!(refs.models.iter().any(|model| model.id == "extra.gguf"));
        assert_eq!(fs.read(&dest().join("models/keep.gguf")).unwrap(), b"keep");
        assert_eq!(
            fs.read(&legacy().join("models/extra.gguf")).unwrap(),
            b"extra"
        );
    }

    #[test]
    fn a_sharing_violation_leaves_the_files_for_the_next_launch() {
        let mut fs = MemFs::new().sharing_violation();
        fs.file(&legacy().join("resume.json"), br#"{"doc":{}}"#);
        fs.dir(&legacy().join("models"));
        fs.file(&legacy().join("models/one.gguf"), b"one");
        let report = adopt(&mut fs, &dest(), &legacy(), false, Path::new("/real")).unwrap();
        assert_eq!(report.resume, FileOutcome::Busy);
        assert_eq!(report.models, ModelOutcome::Busy);
        assert_eq!(
            fs.read(&legacy().join("resume.json")).unwrap(),
            br#"{"doc":{}}"#
        );
        assert!(!fs.is_file(&dest().join("resume.json")));
        assert_eq!(fs.read(&legacy().join("models/one.gguf")).unwrap(), b"one");
        assert!(!fs.is_dir(&dest().join("models")));
    }

    #[test]
    fn invalid_model_refs_are_not_treated_as_done() {
        let mut fs = MemFs::new();
        fs.file(&dest().join("models.ref.json"), b"not json");
        fs.file(&legacy().join("models/one.gguf"), b"one");
        let report = adopt(&mut fs, &dest(), &legacy(), false, Path::new("/real")).unwrap();
        assert_eq!(report.models, ModelOutcome::Moved);
        assert_eq!(fs.read(&dest().join("models/one.gguf")).unwrap(), b"one");
    }

    #[test]
    fn a_crash_between_resume_json_and_engine_json_retries_only_the_missing_file() {
        let mut fs = MemFs::new().fail_rename_at(2);
        fs.file(&legacy().join("resume.json"), b"{\"name\":\"Ada\"}");
        fs.file(&legacy().join("engine.json"), b"{\"provider\":\"local\"}");
        let err = adopt(&mut fs, &dest(), &legacy(), false, Path::new("/real")).unwrap_err();
        assert!(matches!(err, MigrateError::Io(_)));
        assert!(fs.is_file(&dest().join("resume.json")));
        assert!(fs.is_file(&legacy().join("engine.json")));
        assert!(!fs.is_file(&dest().join("engine.json")));

        fs.fail_rename_at = None;
        let report = adopt(&mut fs, &dest(), &legacy(), false, Path::new("/real")).unwrap();
        assert_eq!(report.resume, FileOutcome::Absent);
        assert_eq!(report.engine, FileOutcome::Moved);
        assert_eq!(
            fs.read(&dest().join("resume.json")).unwrap(),
            b"{\"name\":\"Ada\"}"
        );
        assert_eq!(
            fs.read(&dest().join("engine.json")).unwrap(),
            b"{\"provider\":\"local\"}"
        );
        assert!(!fs.is_file(&legacy().join("engine.json")));
    }

    #[test]
    fn a_settings_only_legacy_root_moves_engine_json_and_does_not_invent_resume_json() {
        let mut fs = MemFs::new();
        fs.file(
            &legacy().join("engine.json"),
            b"{\"provider\":\"compatible\"}",
        );
        let report = adopt(&mut fs, &dest(), &legacy(), false, Path::new("/real")).unwrap();
        assert_eq!(report.resume, FileOutcome::Absent);
        assert_eq!(report.engine, FileOutcome::Moved);
        assert!(!fs.is_file(&dest().join("resume.json")));
        assert_eq!(
            fs.read(&dest().join("engine.json")).unwrap(),
            b"{\"provider\":\"compatible\"}"
        );
    }

    #[test]
    fn same_size_different_bytes_are_a_conflict_and_identical_bytes_drop_the_source() {
        let mut conflict = MemFs::new();
        conflict.file(&dest().join("resume.json"), b"aaaa");
        conflict.file(&legacy().join("resume.json"), b"bbbb");
        conflict.file(&dest().join("engine.json"), b"same");
        conflict.file(&legacy().join("engine.json"), b"same");
        let report = adopt(&mut conflict, &dest(), &legacy(), false, Path::new("/real")).unwrap();
        assert_eq!(report.resume, FileOutcome::Conflict);
        assert_eq!(report.engine, FileOutcome::Identical);
        assert_eq!(conflict.read(&dest().join("resume.json")).unwrap(), b"aaaa");
        assert_eq!(
            conflict.read(&legacy().join("resume.json")).unwrap(),
            b"bbbb"
        );
        assert!(!conflict.is_file(&legacy().join("engine.json")));
    }

    #[test]
    fn a_benchmark_refuses_the_real_resume_folder_and_does_not_rename_it() {
        let real = Path::new("/Users/example/Library/Application Support/app.spiral.resume");
        let isolated = Path::new("/spiral/bench-legacy");
        assert!(resolve_bench_legacy(Some(real), isolated, real).is_err());
        assert_eq!(
            resolve_bench_legacy(None, isolated, real).unwrap(),
            isolated
        );

        let mut fs = MemFs::new();
        fs.file(&real.join("resume.json"), b"{\"kept\":true}");
        let err = adopt(&mut fs, &dest(), real, true, real).unwrap_err();
        assert!(matches!(err, MigrateError::BenchRefused));
        assert_eq!(
            fs.read(&real.join("resume.json")).unwrap(),
            b"{\"kept\":true}"
        );
        assert!(!fs.is_file(&dest().join("resume.json")));
        assert_eq!(fs.copied_bytes(), 0);
    }

    #[test]
    fn a_valid_temp_file_fills_a_missing_resume_and_a_corrupt_one_stays() {
        let mut fs = MemFs::new();
        fs.file(&legacy().join("resume.json.tmp"), b"{\"contact\":{}}");
        let report = adopt(&mut fs, &dest(), &legacy(), false, Path::new("/real")).unwrap();
        assert_eq!(report.resume, FileOutcome::RecoveredTemp);
        assert!(fs.is_file(&dest().join("resume.json")));

        let mut broken = MemFs::new();
        broken.file(&legacy().join("resume.json.tmp"), b"not json");
        let report = adopt(&mut broken, &dest(), &legacy(), false, Path::new("/real")).unwrap();
        assert_eq!(report.resume, FileOutcome::LeftTemp);
        assert!(broken.is_file(&legacy().join("resume.json.tmp")));
        assert!(!broken.is_file(&dest().join("resume.json")));
    }

    #[test]
    fn copy_file_counts_bytes_and_adoption_does_not_call_it() {
        let mut fs = MemFs::new();
        fs.file(Path::new("/from"), b"abcd");
        assert_eq!(
            fs.copy_file(Path::new("/from"), Path::new("/to")).unwrap(),
            4
        );
        assert_eq!(fs.copied_bytes(), 4);
    }

    #[test]
    fn the_migration_lock_is_exclusive() {
        let dir = std::env::temp_dir().join(format!("spiral-lock-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("spiral.lock");
        let held = MigrationLock::acquire(&path).unwrap();
        let second = MigrationLock::try_acquire(&path);
        assert!(second.is_err());
        drop(held);
        assert!(MigrationLock::try_acquire(&path).is_ok());
        let _ = fs::remove_dir_all(&dir);
    }
}
