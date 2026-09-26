' ===========================================================================
'  Valheim Control Panel - start
'  Double-click this file (or the desktop shortcut) to start the panel and
'  open it in your browser. No console window stays open.
' ===========================================================================
Option Explicit

Dim fso, shell, root, rc

Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

root = fso.GetParentFolderName(WScript.ScriptFullName)

If Not fso.FileExists(root & "\server\index.js") Then
  MsgBox "This launcher needs to sit next to the ""server"" folder." & vbCrLf & vbCrLf & _
         "Expected to find:" & vbCrLf & root & "\server\index.js", 16, "Valheim Control Panel"
  WScript.Quit 1
End If

If shell.Run("cmd /c node --version", 0, True) <> 0 Then
  MsgBox "Node.js was not found on this PC." & vbCrLf & vbCrLf & _
         "Install Node.js 20 or newer from https://nodejs.org and try again.", 16, "Valheim Control Panel"
  WScript.Quit 1
End If

If Not fso.FolderExists(root & "\data") Then fso.CreateFolder(root & "\data")
shell.CurrentDirectory = root

' 0 = hidden window, True = wait until it finishes. Output is captured so it
' can be shown in a dialog if something goes wrong.
rc = shell.Run("cmd /c node ""tools\launch.mjs"" > ""data\launch.log"" 2>&1", 0, True)

If rc <> 0 Then
  MsgBox "The control panel did not start." & vbCrLf & vbCrLf & ReadTail(root & "\data\launch.log", 20), 16, "Valheim Control Panel"
  WScript.Quit rc
End If

' --------------------------------------------------------------- helpers

Function ReadTail(filePath, lineCount)
  Dim stream, text, lines, i, start, result

  ReadTail = "(no output was captured)"

  If Not fso.FileExists(filePath) Then Exit Function

  On Error Resume Next
  Set stream = fso.OpenTextFile(filePath, 1, False, 0)
  If Err.Number <> 0 Then
    Err.Clear
    Exit Function
  End If
  text = stream.ReadAll
  stream.Close
  On Error GoTo 0

  lines = Split(text, vbLf)
  start = UBound(lines) - lineCount + 1
  If start < 0 Then start = 0

  result = ""
  For i = start To UBound(lines)
    If Trim(lines(i)) <> "" Then result = result & Trim(lines(i)) & vbCrLf
  Next

  If result <> "" Then ReadTail = result
End Function
