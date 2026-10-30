; ---------------------------------------------------------------------------
; JENESIS — one installation, three applications, three shortcuts.
;
; JENESIS ships three applications: Seller, Maintenance and Admin. Each one
; has to open directly in its own environment (its own colour, its own menu,
; its own remembered theme), so each one needs its own shortcut carrying
; --app=<id> and its own icon.
;
; The Windows identity of each window (the App User Model ID that keeps the
; three taskbar buttons apart and makes pinning work) is set by the
; application itself: electron/main.cjs calls window.setAppDetails({ appId })
; with com.jenesis.accounting.<app>. The shortcut only carries the icon and
; the argument.
; ---------------------------------------------------------------------------

!macro CreateJenesisShortcut APPID NAME ICONFILE
  CreateShortCut "$DESKTOP\${NAME}.lnk" \
    "$INSTDIR\${APP_EXECUTABLE_FILENAME}" \
    "--app=${APPID}" \
    "$INSTDIR\resources\app-icons\${ICONFILE}" 0
  CreateShortCut "$SMPROGRAMS\JENESIS\${NAME}.lnk" \
    "$INSTDIR\${APP_EXECUTABLE_FILENAME}" \
    "--app=${APPID}" \
    "$INSTDIR\resources\app-icons\${ICONFILE}" 0
!macroend

!macro DeleteJenesisShortcut NAME
  Delete "$DESKTOP\${NAME}.lnk"
  Delete "$SMPROGRAMS\JENESIS\${NAME}.lnk"
!macroend

!macro customInstall
  CreateDirectory "$SMPROGRAMS\JENESIS"
  !insertmacro CreateJenesisShortcut "seller" "JENESIS Seller" "icon-seller.ico"
  !insertmacro CreateJenesisShortcut "maintenance" "JENESIS Maintenance" "icon-maintenance.ico"
  !insertmacro CreateJenesisShortcut "admin" "JENESIS Admin" "icon-admin.ico"
!macroend

!macro customUnInstall
  !insertmacro DeleteJenesisShortcut "JENESIS Seller"
  !insertmacro DeleteJenesisShortcut "JENESIS Maintenance"
  !insertmacro DeleteJenesisShortcut "JENESIS Admin"
  RMDir "$SMPROGRAMS\JENESIS"
!macroend
