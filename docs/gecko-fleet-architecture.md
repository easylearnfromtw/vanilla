# Gecko Fleet — large server estate readiness

Gecko is the **provisioning and lifecycle plane** for Vanilla's future multi-host
compute estate. Slime runs each node's model services. Ceres Telegram Owner
Studio controls admission and rollout; LUCA should ingest telemetry and audit.

## Three separated planes

| Plane | Responsibility | Trust boundary |
| --- | --- | --- |
| Gecko control plane | Owner-created enrollment pools, fleet membership, inventory, desired Slime release, canary rollout | HTTPS API, Telegram signed Owner `init_data`, no shared node owner secret |
| Gecko distribution plane | Official installers by checksum and optional **explicitly-enabled** LAN cache to save bandwidth | SHA-256 pinned official GitHub Release; no arbitrary URLs or code execution |
| Slime execution plane | Independently registered per-host bearer; heartbeat, optional Ollama model access | Per-node credentials; inference, power, location all **off by default** |

For 100–10,000 hosts, LAN broadcast is **not** the discovery/control plane:
it won't traverse VLANs, data centers, subnets or clouds. The central outbound
HTTPS agent is the primary path. `gecko_lan.py` is strictly an optional local
installer mirror and onboarding helper for small trusted subnets. It never scans
IPs, enumerates SMB shares, silently runs binaries, or hops into neighboring
machines. Disabling it must not affect fleet enrollment.

## Operator authorization and no Telegram code per machine

1. The server administrator verifies each machine belongs to their managed
   estate and establishes an approved device-provisioning mechanism
   (MDM / immutable host image / Ansible Vault / Kubernetes Secret).
2. In **Ceres → Slime → Gecko**, the Owner creates a named pool. A
   short-lived, high-entropy enrollment credential is displayed **only once**
   and cannot be retrieved again. Set its capacity and TTL (default one hour,
   at most 2,000 machines per batch and 24 hours).
3. The operator distributes the credential via a **private management channel**
   to machines they own/control. **Do not** put it into source code, a shared
   public installer or browser query string.
4. The Slime Friend installer supports:
   `GECKO_ENROLLMENT_TOKEN=<secret> GECKO_DEVICE_CONSENT=approved_by_operator SLIME_INSTALL_ROLE=friend python3 slime_desktop.py --fleet`
   on hosts already authorized by the operator. On an interactive unmanaged
   machine, the operator must personally confirm consent.
5. The agent obtains **its own** per-node secret from HTTPS, saves it locally,
   and immediately drops the enrollment credential from its saved profile.
   The registration capacity is atomically decremented. Reboot/reconnection
   reuses the per-node credential and never consumes another seat.
6. The Owner can revoke an enrollment *batch* (stops future joins; does not
   disrupt authorized nodes), or revoke individual nodes via existing Slime
   authenticated deletion workflow. The node holder can always use `--leave`.

The service is disabled unless `GECKO_FLEET_ENABLED=true` **and**
`SLIME_ENABLED=true`. It must not be activated before the durable
`SLIME_DB_PATH`, authentication identity mapping, and real enrollment tests
are verified. Enrollment batches are deliberately exempt from individual
Slime/Google signup Token giveaways (prevents synthetic VM reward farming).

## Owner/agent API contract

| Route | Auth | Action |
| --- | --- | --- |
| `POST /v1/ceres/slime/gecko/issue` | Telegram Owner initData | Create one-hour constrained enrollment pool, see secret one time |
| `POST /v1/ceres/slime/gecko/revoke` | Telegram Owner initData | Revoke unused seats |
| `POST /v1/ceres/slime/gecko/rollout` | Telegram Owner initData | Set official desired tag and 0–100% stable canary cohort |
| `POST /v1/ceres/slime/gecko/snapshot` | Telegram Owner initData | Page through members, group health and capacity |
| `POST /v1/gecko/agent/enroll` | Short-lived high-entropy enrollment secret + authorized-host consent | Issue new device-specific Slime bearer; no Telegram code |
| `GET /v1/gecko/agent/desired` | Device-specific Slime bearer | Return the desired release tag without executing it |

Agent registration is limited by pool capacity and owner total. Each new host
is `friend`, inference off, no shutdown capability, no IP geolocation.
The deployment provider should rate-limit aggregate enrollments at its edge,
observe failed attempts, and enforce ACLs before public fleet activation.

## Version delivery without disrupting users

A future update agent should poll no more than once per 10–30 minutes with
per-node jitter and backoff. Desired versions must match approved **official
tag names**; only download the platform-specific payload and validate the
Release SHA-256 (and ideally signed provenance and certificate validation).
Use capped transfer bandwidth, a single concurrent stream, idle/thermal
checks and atomic file rename. **Download-only** until a separately authorized
maintenance window. Roll out in rings: internal canary 1%, 5%, 20%, 100%, with
automated error-budget halts, rollback target, and node-side last-known-good
binary. Network/host access and model inference remain separate permissions.

The optional LAN mirroring helper (`gecko_lan.py`) caps delivery around
384 KiB/s. Managed Slime Fleet nodes poll desired version with per-host startup
jitter, at intervals of 30–40 minutes. `gecko_update.py` fetches only the
matching OS release asset, postpones downloads on busy Unix hosts, validates
its GitHub Release SHA-256, and caches it privately at ~192 KiB/s. It **never
executes, installs or restarts software**. This first stage is verified
background *prefetch* only: no automatic installer, cryptographically signed
provenance, remote restart or cluster-wide rollback executor yet.

For high-scale production, replace direct GitHub pulls with site-local
authenticated artifact caches; otherwise thousands of concurrent updates
could overwhelm WAN capacity or public GitHub rate limits.

## Scale architecture: recommended migration gates

- **Pilot:** 5–20 owned test hosts, local SQLite with durable disk, one
  orchestrator, device telemetry and repeated restart/revocation tests.
- **Small estate:** 20–200 hosts, inventory groups, central artifact mirror,
  fleet-aware metrics, admission audit, rotation and fixed rollout windows.
- **1000+ machines / multiple data centers:** replace SQLite with PostgreSQL
  (transactions, enrollment constraints, HA replicas), a queue for asynchronous
  work and event-driven inventory, Redis for short leases, S3-compatible
  artifact object storage + regional cache, internal CA/mTLS for host identity,
  mutual attestation where feasible, and a per-site agent/router instead of
  depending on UDP LAN discovery. Batch/limit telemetry and apply adaptive
  polling to avoid excessive heartbeats.
- **10k+ machines:** multiple availability zones, sharded agent ingest,
  rate-limited deployment rings, durable work queues, per-site bandwidth quotas,
  isolation of tenant/site identities, audit retention, disaster recovery,
  integration with LUCA and Ceres with a protected delegated Owner role.

**Known boundary:** Current implementation is a single-controller SQLite
prototype with a nominal 10,000 member admission cap, **not** tested for
10,000 simultaneous heartbeats. Avoid enabling at scale until the storage
and operations layers above are implemented and load-tested.
