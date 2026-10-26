; ------------------------------------------------------------------
; Habillage MyBad Esport de l'installateur (NSIS / Modern UI 2)
; ------------------------------------------------------------------
; Texte net : police système moderne et prise en charge des écrans à forte densité (sinon Windows étire la fenêtre en flou)
ManifestDPIAware true
SetFont "Segoe UI" 9

!define MUI_BGCOLOR "090B17"
!define MUI_TEXTCOLOR "F5F7FF"
!define MUI_INSTFILESPAGE_COLORS "C9CFEA 0E1020"
!define MUI_INSTFILESPAGE_PROGRESSBAR "colored"
!define MUI_CUSTOMFUNCTION_GUIINIT mbGuiInit
!define MUI_CUSTOMFUNCTION_UNGUIINIT un.mbGuiInit

!ifndef BUILD_UNINSTALLER
  !define MUI_WELCOMEPAGE_TITLE "Bienvenue dans MyBad Creator"
  !define MUI_WELCOMEPAGE_TEXT "L'éditeur d'affiches de MyBad Esport : roster, matchday, résultats, plannings, recrutement et tournois, avec calques, effets et modèles 3D.$\r$\n$\r$\nCet assistant va installer MyBad Creator ${VERSION} sur ton ordinateur.$\r$\n$\r$\nClique sur Suivant pour continuer."
  !define MUI_FINISHPAGE_TITLE "C'est prêt !"
  !define MUI_FINISHPAGE_TEXT "MyBad Creator est installé.$\r$\n$\r$\nUn raccourci a été ajouté sur ton Bureau et dans le menu Démarrer.$\r$\n$\r$\nPOLARIS / NORTH STAR"
  !define MUI_FINISHPAGE_RUN_TEXT "Lancer MyBad Creator"
!else
  !define MUI_WELCOMEPAGE_TITLE "Désinstaller MyBad Creator"
  !define MUI_WELCOMEPAGE_TEXT "Cet assistant va retirer MyBad Creator de ton ordinateur.$\r$\n$\r$\nTes projets .mybad et tes affiches exportées ne sont pas supprimés.$\r$\n$\r$\nClique sur Suivant pour continuer."
  !define MUI_FINISHPAGE_TITLE "Désinstallation terminée"
  !define MUI_FINISHPAGE_TEXT "MyBad Creator a été retiré de ton ordinateur.$\r$\n$\r$\nÀ bientôt sur le serveur MyBad."
!endif

!macro customWelcomePage
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW mbDarkWelcome
  !insertmacro MUI_PAGE_WELCOME
!macroend

; Retire le thème visuel Windows d'un contrôle pour que nos couleurs s'appliquent.
!macro MB_UNTHEME HWND
  System::Call 'uxtheme::SetWindowTheme(p ${HWND}, w " ", w " ")'
!macroend

; Bouton Windows en mode sombre (thème « DarkMode_Explorer », Windows 10 1809 et plus ; ignoré ailleurs).
!macro MB_DARKBTN HWND
  System::Call 'uxtheme::#133(p ${HWND}, i 1)'
  System::Call 'uxtheme::SetWindowTheme(p ${HWND}, w "DarkMode_Explorer", p 0)'
  System::Call 'user32::SendMessageW(p ${HWND}, i 0x031A, p 0, p 0)'
!macroend

; Fond sombre sur la fenêtre principale (zone des boutons, lignes, mention en bas).
!macro MB_GUIINIT
  System::Call 'uxtheme::#135(i 2)'
  System::Call 'dwmapi::DwmSetWindowAttribute(p $HWNDPARENT, i 20, *i 1, i 4)'
  SetCtlColors $HWNDPARENT "C9CFEA" "0E1020"
  GetDlgItem $0 $HWNDPARENT 1
  !insertmacro MB_DARKBTN $0
  GetDlgItem $0 $HWNDPARENT 2
  !insertmacro MB_DARKBTN $0
  GetDlgItem $0 $HWNDPARENT 3
  !insertmacro MB_DARKBTN $0
  GetDlgItem $0 $HWNDPARENT 1028
  SetCtlColors $0 "5B6085" "0E1020"
  GetDlgItem $0 $HWNDPARENT 1256
  SetCtlColors $0 "5B6085" "0E1020"
  GetDlgItem $0 $HWNDPARENT 1035
  ShowWindow $0 0
  GetDlgItem $0 $HWNDPARENT 1045
  ShowWindow $0 0
!macroend

; Assombrit la page intérieure courante et ses contrôles (boutons en mode sombre).
!macro MB_DARK_INNER
  FindWindow $R0 "#32770" "" $HWNDPARENT
  SetCtlColors $R0 "F5F7FF" "090B17"
  StrCpy $R1 0
  mb_loop:
    FindWindow $R1 "" "" $R0 $R1
    StrCmp $R1 0 mb_done
    System::Call 'user32::GetClassNameW(p $R1, w .R2, i 64)'
    StrCmp $R2 "Edit" mb_edit
    StrCmp $R2 "msctls_progress32" mb_prog
    StrCmp $R2 "Button" mb_btn
    SetCtlColors $R1 "F5F7FF" "090B17"
    Goto mb_loop
  mb_edit:
    SetCtlColors $R1 "F5F7FF" "141730"
    Goto mb_loop
  mb_prog:
    !insertmacro MB_UNTHEME $R1
    SendMessage $R1 0x0409 0 0x00FFD854
    SendMessage $R1 0x2001 0 0x00301714
    Goto mb_loop
  mb_btn:
    System::Call 'user32::GetWindowLongW(p $R1, i -16) i .R3'
    IntOp $R3 $R3 & 0xF
    IntCmp $R3 1 mb_push mb_push
    !insertmacro MB_UNTHEME $R1
    SetCtlColors $R1 "F5F7FF" "090B17"
    Goto mb_loop
  mb_push:
    !insertmacro MB_DARKBTN $R1
    Goto mb_loop
  mb_done:
!macroend

; Fonctions déclarées après l'insertion des pages (variables MUI disponibles)
!macro customHeader
Function mbGuiInit
  !insertmacro MB_GUIINIT
FunctionEnd
!ifndef BUILD_UNINSTALLER
  Function mbDarkWelcome
  FunctionEnd
  Function mbDarkDirectory
    !insertmacro MB_DARK_INNER
  FunctionEnd
  Function mbDarkInstFiles
    !insertmacro MB_DARK_INNER
  FunctionEnd
  Function mbDarkFinish
    ${If} $mui.FinishPage.Run != ""
      !insertmacro MB_UNTHEME $mui.FinishPage.Run
      SetCtlColors $mui.FinishPage.Run "F5F7FF" "090B17"
    ${EndIf}
  FunctionEnd
!else
  Function un.mbGuiInit
    !insertmacro MB_GUIINIT
  FunctionEnd
  Function un.mbDarkInstFiles
    !insertmacro MB_DARK_INNER
  FunctionEnd
!endif
!macroend
