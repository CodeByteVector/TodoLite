; TodoLite — NSIS installer/uninstaller hooks.
; Guarantees a FULL uninstall: no files, no folders, no data remain.

!macro NSIS_HOOK_POSTUNINSTALL
  DetailPrint "Removing TodoLite user data..."
  RMDir /r "$APPDATA\com.codebytevector.todolite"
  RMDir "$APPDATA\com.codebytevector.todolite"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "TodoLite"
!macroend