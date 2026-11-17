Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "C:\Users\JOMAR\Desktop\pagina web alina"
WshShell.Run "node server.cjs", 0, False
