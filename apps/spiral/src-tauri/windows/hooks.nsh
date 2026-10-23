; Spiral — NSIS install hooks.
; The new product name is Spiral, so the install directory is not the
; Spiral Wallpaper directory. Remove that older install quietly.
; Do not delete the app-data directory. The desktop image path lives there.
;
; `_?=$OldDir` keeps the old uninstaller in its own directory so ExecWait
; does not return while that uninstall is still deleting files.

!include "FileFunc.nsh"
!insertmacro GetParent

Var OldDir

!macro NSIS_HOOK_PREINSTALL
  DetailPrint "Checking for Spiral Wallpaper..."
  StrCpy $R9 ""
  ReadRegStr $R9 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Spiral Wallpaper" "UninstallString"
  ${If} $R9 == ""
    ReadRegStr $R9 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Spiral Wallpaper" "UninstallString"
  ${EndIf}
  ${If} $R9 != ""
    StrCpy $R8 $R9
    StrCpy $R7 $R8 1
    ${If} $R7 == '"'
      StrCpy $R8 $R8 "" 1
      StrCpy $R8 $R8 -1
    ${EndIf}
    ${GetParent} "$R8" $OldDir
    ${If} $OldDir != ""
      DetailPrint "Removing the previous Spiral Wallpaper install."
      ExecWait '"$R8" /S _?=$OldDir'
    ${EndIf}
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
  ReadRegStr $R8 HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Spiral Wallpaper"
  ${If} $R8 != ""
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Spiral Wallpaper" '"$INSTDIR\${MAINBINARYNAME}.exe"'
  ${EndIf}
  DetailPrint "Done. Nothing else happens until you open it."
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  DetailPrint "Removing Spiral..."
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  DetailPrint "Spiral is removed. Your wallpapers were left in place."
!macroend
