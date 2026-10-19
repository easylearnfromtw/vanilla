"""Mandatory rootless Bubblewrap boundary for native PdfCraft CLI.

No direct execution fallback. The network namespace has no egress, backend
secrets/volumes are not mounted, and only a private one-job work directory
is writable. If the Railway kernel disallows user namespaces, fail closed.
"""
from __future__ import annotations

import asyncio
import os
from pathlib import Path
import resource
import subprocess


BWRAP = "/usr/bin/bwrap"
CLI = "/usr/local/bin/pdfcraft-cli"
MAX_OUTPUT = 12 * 1024 * 1024


def _base_args() -> list[str]:
    # /usr includes the checksum-verified CLI and standard runtime libraries.
    # /app, /data, /root and the host /tmp are deliberately not visible.
    arguments = [
        BWRAP, "--die-with-parent", "--new-session",
        "--unshare-user", "--unshare-pid", "--unshare-ipc",
        "--unshare-uts", "--unshare-net",
        "--cap-drop", "ALL",
        "--ro-bind", "/usr", "/usr",
        "--ro-bind", "/lib", "/lib",
        "--ro-bind", "/lib64", "/lib64",
        "--proc", "/proc",
        "--dev", "/dev",
        "--tmpfs", "/tmp",
    ]
    # Optional fonts are read-only; PDF merging should not need network.
    if Path("/etc/fonts").is_dir():
        arguments += ["--dir", "/etc", "--ro-bind", "/etc/fonts", "/etc/fonts"]
    return arguments


def probe_sandbox() -> bool:
    """Proof that no-network user/mount namespace creation is permitted."""
    if os.environ.get("WEIGUO_PDFCRAFT_SANDBOX") != "bubblewrap":
        return False
    binary = Path(BWRAP)
    if not binary.is_file() or binary.is_symlink() or not os.access(BWRAP, os.X_OK):
        return False
    if not Path("/usr/bin/true").is_file():
        return False
    try:
        run = subprocess.run(
            [*_base_args(), "--", "/usr/bin/true"],
            env={"PATH": "/usr/bin:/bin", "HOME": "/tmp", "LANG": "C.UTF-8"},
            stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            timeout=3, check=False,
        )
        return run.returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        return False


def sandbox_argv(inputs: int) -> tuple[str, ...]:
    if inputs not in (2, 3):
        raise ValueError("僅允許 2–3 個 PDF")
    args = [
        *_base_args(),
        "--bind", "/work", "/work",
        "--chdir", "/work",
        "--setenv", "HOME", "/work",
        "--setenv", "TMPDIR", "/tmp",
        "--",
        CLI, "combine",
        *(f"/work/source-{n}.pdf" for n in range(1, inputs + 1)),
        "--out", "/work/merged.pdf",
    ]
    return tuple(args)


def resource_limits() -> None:
    """Runs only in native subprocess child immediately before exec."""
    for key, value in (
        (resource.RLIMIT_CPU, 35),
        (resource.RLIMIT_FSIZE, MAX_OUTPUT),
        (resource.RLIMIT_NOFILE, 128),
    ):
        soft, hard = resource.getrlimit(key)
        limit = min(value, hard) if hard != resource.RLIM_INFINITY else value
        resource.setrlimit(key, (limit, limit))
    # No adjustable RLIMIT_AS: memory accounting is enforced by container cgroups.


async def spawn_sandboxed(workdir: str, inputs: int) -> asyncio.subprocess.Process:
    """Never substitute an unconfined subprocess if Bubblewrap rejects isolation."""
    cmd = list(sandbox_argv(inputs))
    # bwrap's --bind path must resolve the parent-created private directory.
    flag = cmd.index("--bind")
    cmd[flag + 1] = workdir
    environment = {
        "PATH": "/usr/bin:/bin",
        "HOME": workdir,
        "TMPDIR": workdir,
        "XDG_CACHE_HOME": workdir,
        "LANG": "C.UTF-8",
    }
    return await asyncio.create_subprocess_exec(
        *cmd, cwd=workdir, env=environment, preexec_fn=resource_limits,
        stdin=asyncio.subprocess.DEVNULL,
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.DEVNULL,
    )
