' ===========================================================================
'  Valheim Control Panel - create a desktop shortcut
'  Run this once. It puts "Valheim Control Panel" on your Desktop with the
'  panel icon, so you can start everything with one double-click.
' ===========================================================================
Option Explicit

Dim fso, shell, root, desktop, linkPath, link, iconPath

Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

root = fso.GetParentFolderName(WScript.ScriptFullName)

If Not fso.FileExists(root & "\Start Valheim Panel.vbs") Then
  MsgBox "Could not find ""Start Valheim Panel.vbs"" next to this file.", 16, "Valheim Control Panel"
  WScript.Quit 1
End If

desktop = shell.SpecialFolders("Desktop")
linkPath = desktop & "\Valheim Control Panel.lnk"

Set link = shell.CreateShortcut(linkPath)
link.TargetPath = root & "\Start Valheim Panel.vbs"
link.WorkingDirectory = root
link.Description = "Start the Valheim control panel"

iconPath = root & "\assets\panel.ico"
If fso.FileExists(iconPath) Then link.IconLocation = iconPath

link.Save

MsgBox "Done - ""Valheim Control Panel"" is now on your Desktop." & vbCrLf & vbCrLf & _
       "To also start it automatically when you sign in to Windows, copy the" & vbCrLf & _
       "shortcut into this folder:" & vbCrLf & vbCrLf & _
       "   %APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup", 64, "Valheim Control Panel"
