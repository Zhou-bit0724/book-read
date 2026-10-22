Option Explicit

Dim fso, shell, nodeExe, scriptPath, rootPath
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

rootPath = "D:\Deepseeek\wenku8-web"
scriptPath = rootPath & "\scripts\start.js"
nodeExe = "C:\Users\zoa20\AppData\Local\hermes\node\node.exe"

If Not fso.FileExists(nodeExe) Then
  nodeExe = "node.exe"
End If

shell.CurrentDirectory = rootPath
shell.Run """" & nodeExe & """ """ & scriptPath & """", 0, False
