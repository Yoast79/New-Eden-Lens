#define MyAppName "New Eden Lens"
#define MyAppVersion "0.6.0"
#define MyAppPublisher "Fenris Creations"
#define MyAppURL "https://new-eden-lens.com"
#define MyAppExeName "New Eden Lens.exe"

[Setup]
AppId={{C9B4E3F2-6A1D-4D7E-9B0A-4F8C1D2E3A06}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} v{#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
AppCopyright=Copyright (C) 2026 {#MyAppPublisher}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputDir=..\dist
OutputBaseFilename=NewEdenLens-Setup-{#MyAppVersion}
SetupIconFile=..\resources\icon.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern dark
WizardImageFile=wizard-sidebar.bmp
WizardSmallImageFile=wizard-small.bmp
WizardResizable=no
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=lowest

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Messages]
WelcomeLabel1=Welcome to {#MyAppName} v{#MyAppVersion}
WelcomeLabel2=This will install {#MyAppName} v{#MyAppVersion} by {#MyAppPublisher} on your computer.%n%nA local-first desktop omni-tool for EVE Online — Market, Fitting, Industry, Mining, PI, Tactical Map, and Intel in one window.%n%nClick Next to continue.
FinishedHeadingLabel=Completing {#MyAppName} v{#MyAppVersion} Setup
FinishedLabel={#MyAppName} v{#MyAppVersion} has been installed on your computer. Click Finish to launch or exit Setup.

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "..\dist\win-unpacked\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent

[Code]
procedure InitializeWizard();
begin
  // Deep-space theme matching new-eden-lens.com (#04070E bg, #0B1220 panel, #38BDF8 sky accent, #E2E8F0 text)
  WizardForm.Color := $0E0704;
  WizardForm.InnerPage.Color := $20120B;
  WizardForm.MainPanel.Color := $120B07;
  WizardForm.WelcomePage.Color := $0E0704;
  WizardForm.FinishedPage.Color := $0E0704;

  WizardForm.WelcomeLabel1.Font.Color := $F8BD38;
  WizardForm.WelcomeLabel2.Font.Color := $F0E8E2;
  WizardForm.PageNameLabel.Font.Color := $F8BD38;
  WizardForm.PageDescriptionLabel.Font.Color := $B8A394;
  WizardForm.FinishedHeadingLabel.Font.Color := $F8BD38;
  WizardForm.FinishedLabel.Font.Color := $F0E8E2;
end;

