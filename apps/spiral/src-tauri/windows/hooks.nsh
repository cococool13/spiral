; Spiral — NSIS install hooks.
; The new product name is Spiral, so the install directory is not the
; Spiral Wallpaper directory. Remove that older install quietly.
; Do not delete the app-data directory. The desktop image path lives there.

!macro NSIS_HOOK_PREINSTALL
  DetailPrint "Checking for Spiral Wallpaper..."
  StrCpy $R9 ""
  ReadRegStr $R9 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Spiral Wallpaper" "UninstallString"
  ${If} $R9 == ""
    ReadRegStr $R9 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Spiral Wallpaper" "UninstallString"
  ${EndIf}
  ${If} $R9 != ""
    DetailPrint "Removing the previous Spiral Wallpaper install."
    ExecWait '$R9 /S'
  ${EndIf}
  DetailPrint "Copying files to your machine..."
!macroend

!macro NSIS_HOOK_POSTINSTALL
  DetailPrint "Spiral is linked to your Start Menu."
  DetailPrint "Verifying the install..."
  IfFileExists "$INSTDIR\${MAINBINARYNAME}.exe" +3 0
    DetailPrint "Verification failed: ${MAINBINARYNAME}.exe is missing. Re-run this installer."
    Abort "Verification failed: ${MAINBINARYNAME}.exe is missing from $INSTDIR."
  DetailPrint "Verified."
  DetailPrint "Done. Nothing else happens until you open it."
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  DetailPrint "Removing Spiral..."
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  DetailPrint "Spiral is removed. Your wallpapers were left in place."
!macroend
