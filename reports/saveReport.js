// reports/saveReport.js
const fs = require('fs');
const path = require('path');
const { logsDir } = require('../utils/directories');

function saveBackupReport(screenshotPath, recentUsers) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const report = {
        timestamp: new Date().toISOString(),
        screenshot: screenshotPath,
        uniqueUsersCount: recentUsers.length,
        usernames: recentUsers,
    };

    const filePath = path.join(logsDir, `report-${timestamp}.json`);
    fs.writeFileSync(filePath, JSON.stringify(report, null, 2));
}

module.exports = { saveBackupReport };