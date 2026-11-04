; ---------------------------------------------------------------------------
; JENESIS — one installation, four applications, four shortcuts.
;
; JENESIS ships four applications, each opening directly in its own
; environment (its own colour, its own menu, its own remembered theme), so
; each one needs its own shortcut carrying --app=<id> and its own icon:
;
;   JENESIS Seller                  (red)    --app=seller
;   JENESIS Network & Maintenance   (green)  --app=maintenance
;   JENESIS Accounting & Business   (blue)   --app=admin
;   JENESIS Settings & Access Point (yellow) --app=settings
;
; All four talk to ONE database and ONE accounting engine. The shortcuts only
; choose which face of the same installation the window opens with.
;
; The Windows identity of each window (the App User Model ID that keeps the
; four taskbar buttons apart and makes pinning work) is set by the
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
  !insertmacro CreateJenesisShortcut "maintenance" "JENESIS Network & Maintenance" "icon-maintenance.ico"
  !insertmacro CreateJenesisShortcut "admin" "JENESIS Accounting & Business" "icon-admin.ico"
  !insertmacro CreateJenesisShortcut "settings" "JENESIS Settings & Access Point" "icon-settings.ico"
!macroend

!macro customUnInstall
  !insertmacro DeleteJenesisShortcut "JENESIS Seller"
  !insertmacro DeleteJenesisShortcut "JENESIS Network & Maintenance"
  !insertmacro DeleteJenesisShortcut "JENESIS Accounting & Business"
  !insertmacro DeleteJenesisShortcut "JENESIS Settings & Access Point"
  ; Shortcuts left behind by 0.5.3 and earlier, when the applications had
  ; shorter names. They are removed so an upgrade never leaves two icons
  ; pointing at the same application.
  !insertmacro DeleteJenesisShortcut "JENESIS Maintenance"
  !insertmacro DeleteJenesisShortcut "JENESIS Admin"
  RMDir "$SMPROGRAMS\JENESIS"
!macroend
