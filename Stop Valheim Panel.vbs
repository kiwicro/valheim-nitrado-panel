' ===========================================================================
'  Valheim Control Panel - stop
'  Stops the panel started by "Start Valheim Panel.vbs".
'  Only the panel is stopped; other node processes are left alone.
' ===========================================================================
Option Explicit

Dim fso, shell, root, rc

Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

root = fso.GetParentFolderName(WScript.ScriptFullName)

If Not fso.FolderExists(root & "\data") Then fso.CreateFolder(root & "\data")
shell.CurrentDirectory = root

rc = shell.Run("cmd /c node ""tools\stop.mjs"" > ""data\stop.log"" 2>&1", 0, True)

MsgBox ReadTail(root & "\data\stop.log", 8), 64, "Valheim Control Panel"

' --------------------------------------------------------------- helpers

Function ReadTail(filePath, lineCount)
  Dim stream, text, lines, i, start, result

  ReadTail = "The panel does not appear to be running."

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
