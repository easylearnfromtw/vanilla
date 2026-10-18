# Vanilla Google Drive — individual accounts (Plan B)

Each family member (哲愷, 哲緯, 曉芬) uses their own Google account and their own Google Drive appDataFolder. No shared storage account.

## Setup
1. Enable Google Drive API in Google Cloud project vanilla-512010.
2. In Google Auth Platform > Audience, add each Google account as an OAuth test user.
3. Keep the existing Vanilla Web OAuth client, authorized JavaScript origin https://easylearnfromtw.github.io.
4. Each user authorizes the drive.appdata scope separately.
5. Each user must have a separate vault encryption passphrase.

## Required security before sync
- Authenticate the actual Google account and bind its stable account ID to the correct member. A name dropdown is not authentication.
- Clear old account access tokens on every member switch.
- Check account binding before every cloud read and write.
- Encrypt locally before upload; do not persist access tokens in localStorage.
- Add offline conflict handling, recovery and deletion workflows.
- Do not upload family private data before end-to-end authorization tests.

Current implementation remains a prototype. The existing shared-account UI must be updated to reflect Plan B; automatic sync is not enabled.
