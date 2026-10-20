#define AppName "Vanilla Windows Node"
[Setup]
AppId={{705244EF-EE01-48D0-81AA-E0E2A60E3A73}
AppName={#AppName}
AppVersion=0.1.0
DefaultDirName={localappdata}\Programs\VanillaNode
DefaultGroupName=Vanilla AI
OutputDir=..\..\dist
OutputBaseFilename=Vanilla-Windows-Node-Setup
PrivilegesRequired=lowest
Compression=lzma
SolidCompression=yes
UninstallDisplayIcon={app}\VanillaNode.exe
[Files]
Source: "..\..\dist\VanillaNode.exe"; DestDir: "{app}"; Flags: ignoreversion
[Icons]
Name: "{autoprograms}\Vanilla Node"; Filename: "{app}\VanillaNode.exe"
[Tasks]
Name: "autostart"; Description: "登入 Windows 後自動啟動節點（選用）"; GroupDescription: "啟動方式"; Flags: unchecked
[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "VanillaNode"; ValueData: """{app}\VanillaNode.exe"""; Flags: uninsdeletevalue; Tasks: autostart
[Run]
Filename: "{app}\VanillaNode.exe"; Description: "啟動 Vanilla Node 並顯示配對權杖"; Flags: postinstall nowait skipifsilent
