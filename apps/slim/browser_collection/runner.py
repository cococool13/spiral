from dataclasses import dataclass
import subprocess


@dataclass(frozen=True)
class CommandResult:
    argv: tuple
    returncode: int
    stdout: str
    stderr: str


class SubprocessRunner:
    def run(self, argv, timeout=15):
        if isinstance(argv, (str, bytes)) or not isinstance(argv, (list, tuple)):
            raise TypeError("argv must be an argument sequence")
        completed = subprocess.run(
            list(argv),
            check=False,
            capture_output=True,
            text=True,
            timeout=timeout,
            shell=False,
        )
        return CommandResult(
            argv=tuple(argv),
            returncode=completed.returncode,
            stdout=completed.stdout,
            stderr=completed.stderr,
        )
