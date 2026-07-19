BEARCREST CRM VERSION 8 — SETUP

PART 1 — GOOGLE
1. Create or choose the Google Sheet that will hold your CRM data.
2. Create or choose one Google Drive folder where all loan folders will be created.
3. Open the file named Google_Apps_Script_Code.gs in this package.
4. In Google Apps Script, replace:
   PASTE_GOOGLE_SHEET_ID_HERE
   PASTE_GOOGLE_DRIVE_FOLDER_ID_HERE

How to find the IDs:
- Sheet ID: the long section in the Google Sheet URL between /d/ and /edit
- Folder ID: the long section at the end of the Google Drive folder URL

5. Run setupBearCrestCRM() one time and approve permissions.
6. Deploy as a Web App:
   - Execute as: Me
   - Who has access: Anyone
7. Copy the Web App URL.

PART 2 — GITHUB
1. Open your existing BearCrest Mobile GitHub repository.
2. Upload:
   index.html
   styles.css
   app.js
   manifest.json
   service-worker.js
   icon-192.svg
   icon-512.svg
3. Replace the old files and commit directly to main.
4. Wait 1–3 minutes for GitHub Pages to rebuild.

PART 3 — CONNECT
1. Open the CRM website.
2. Paste the Google Apps Script Web App URL when prompted.
3. Click Save Connection.
4. Refresh.

RESULT
- Desktop and phone use the same Google Sheet.
- New applications can be imported.
- Loan folders are created in Google Drive.
- Documents can be uploaded directly into each loan.
- Changes made on one device appear on the other after refresh.
