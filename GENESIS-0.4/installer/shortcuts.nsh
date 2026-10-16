; electron-builder creates the Administrator shortcuts automatically. These two
; additional entries launch the SAME installation with a different, validated mode.
; One running desktop process serves all three; they never merge SQLite copies.
!macro customInstall
  CreateDirectory "$SMPROGRAMS\JENESIS"
  CreateShortCut "$SMPROGRAMS\JENESIS\JENESIS Seller.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "--jenesis-mode=seller" "$INSTDIR\resources\icons\j-seller.ico" 0 SW_SHOWNORMAL "" "JENESIS Seller"
  CreateShortCut "$SMPROGRAMS\JENESIS\JENESIS Network and Maintenance.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "--jenesis-mode=network" "$INSTDIR\resources\icons\j-network.ico" 0 SW_SHOWNORMAL "" "JENESIS Network and Maintenance"
  CreateShortCut "$DESKTOP\JENESIS Seller.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "--jenesis-mode=seller" "$INSTDIR\resources\icons\j-seller.ico" 0 SW_SHOWNORMAL "" "JENESIS Seller"
  CreateShortCut "$DESKTOP\JENESIS Network and Maintenance.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "--jenesis-mode=network" "$INSTDIR\resources\icons\j-network.ico" 0 SW_SHOWNORMAL "" "JENESIS Network and Maintenance"
!macroend

!macro customUnInstall
  Delete "$SMPROGRAMS\JENESIS\JENESIS Seller.lnk"
  Delete "$SMPROGRAMS\JENESIS\JENESIS Network and Maintenance.lnk"
  RMDir "$SMPROGRAMS\JENESIS"
  Delete "$DESKTOP\JENESIS Seller.lnk"
  Delete "$DESKTOP\JENESIS Network and Maintenance.lnk"
  ; Never remove userData, the old GENESIS database, or safety copies.
!macroend
