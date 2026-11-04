// Installateur Heliance Creator : une fenêtre sur mesure (tuiles arrondies, verre, halos) qui pilote le vrai installateur NSIS en arrière-plan.
// Le moteur (l'installateur NSIS habituel, intact : mises à jour, désinstallation, registre) est embarqué dans cet exe sous le nom « moteur.exe ».
// Code volontairement en C# 5 : il se compile avec csc.exe, déjà présent dans Windows (.NET Framework 4.8), sans rien installer.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Threading;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Media.Effects;
using System.Windows.Media.Imaging;
using System.Windows.Threading;
using Microsoft.Win32;
using Shapes = System.Windows.Shapes;
using IOPath = System.IO.Path;

namespace MyBadInstallateur
{
    static class Programme
    {
        public static string DossierImpose;
        public static bool Auto;

        [STAThread]
        static int Main(string[] args)
        {
            // Mode silencieux (mises à jour automatiques, déploiements) : on relaie tel quel au moteur, sans fenêtre.
            foreach (string a in args) if (string.Equals(a, "/S", StringComparison.OrdinalIgnoreCase)) return Moteur.Silencieux(args);
            string page = null, sortie = null;
            for (int i = 0; i < args.Length - 2; i++) if (args[i] == "--apercu") { page = args[i + 1]; sortie = args[i + 2]; }
            // --dossier <chemin> : dossier d'installation proposé ; --auto : lance l'installation tout de suite (tests et déploiements)
            for (int i = 0; i < args.Length - 1; i++) if (args[i] == "--dossier") DossierImpose = args[i + 1];
            foreach (string a in args) if (a == "--auto") Auto = true;
            var app = new Application();
            var fen = new Fenetre(page, sortie);
            return app.Run(fen);
        }
    }

    static class Moteur
    {
        public static string Extraire()
        {
            string dossier = IOPath.Combine(IOPath.GetTempPath(), "MyBadCreator-installation-" + Guid.NewGuid().ToString("N").Substring(0, 8));
            Directory.CreateDirectory(dossier);
            string exe = IOPath.Combine(dossier, "moteur.exe");
            using (Stream src = Assembly.GetExecutingAssembly().GetManifestResourceStream("moteur.exe"))
            using (FileStream dst = File.Create(exe)) src.CopyTo(dst, 1 << 20);
            return exe;
        }
        public static void Nettoyer(string exe)
        {
            try { Directory.Delete(IOPath.GetDirectoryName(exe), true); } catch { }
        }
        public static int Silencieux(string[] args)
        {
            string exe = Extraire();
            try
            {
                var p = Process.Start(new ProcessStartInfo(exe, string.Join(" ", args)) { UseShellExecute = false });
                p.WaitForExit();
                return p.ExitCode;
            }
            finally { Nettoyer(exe); }
        }
        /// <summary>Dossier d'installation actuel s'il y en a un (réinstallation, mise à jour), sinon le dossier par défaut.</summary>
        public static string DossierParDefaut()
        {
            string existant = Existant();
            if (!string.IsNullOrEmpty(existant)) return existant;
            return IOPath.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", K.Dossier);
        }
        /// <summary>Vrai si l'installation existante est « pour tous les utilisateurs » (Program Files) : la mise à jour doit alors se faire au même endroit, avec l'autorisation de Windows.</summary>
        public static bool ParMachine;

        /// <summary>Dossier d'une installation existante (pour moi, sinon pour tous), ou null.</summary>
        public static string Existant()
        {
            ParMachine = false;
            try { using (var cle = Registry.CurrentUser.OpenSubKey(@"Software\" + K.Guid)) { if (cle != null) { object v = cle.GetValue("InstallLocation"); if (v != null && v.ToString().Length > 0) return v.ToString(); } } } catch { }
            try { using (var cle = Registry.LocalMachine.OpenSubKey(@"Software\" + K.Guid)) { if (cle != null) { object v = cle.GetValue("InstallLocation"); if (v != null && v.ToString().Length > 0) { ParMachine = true; return v.ToString(); } } } } catch { }
            return null;
        }
    }

    class Tuile
    {
        public Border Exterieur;   // porte l'ombre
        public Grid Contenu;       // ce qu'on y dépose
    }

    class Fenetre : Window
    {
        // ---- palette (celle du logo Heliance Esport) ----
        const string Fond = "#FF090B17", Texte = "#FFE8EBFA", Doux = "#FFA5ABCB", Cyan = "#FF54D8FF";
        static readonly FontFamily Titres = new FontFamily("Segoe UI Variable Display, Segoe UI");
        static readonly FontFamily Corps = new FontFamily("Segoe UI Variable Text, Segoe UI");

        Grid hote;                 // les pages s'affichent ici
        UIElement pageCourante;
        bool installation;         // pendant l'installation la fenêtre ne se ferme pas
        string dossier;
        bool raccourciBureau = true, raccourciDemarrer = true;
        string sortieApercu;
        BitmapImage icone;
        TextBlock txtDossier, txtDispo, txtPct;
        Border remplissage, barreFond;
        Border[] points = new Border[3];
        TextBlock[] etapes = new TextBlock[3];
        string installeDans;
        int codeSortie;
        double pctAffiche;

        public Fenetre(string pageApercu, string sortie)
        {
            sortieApercu = sortie;
            Title = "Installation de Heliance Creator";
            WindowStyle = WindowStyle.None; AllowsTransparency = true; Background = Brushes.Transparent; ResizeMode = ResizeMode.NoResize;
            Width = 808; Height = 548; WindowStartupLocation = WindowStartupLocation.CenterScreen;
            UseLayoutRounding = true; SnapsToDevicePixels = true;
            TextOptions.SetTextFormattingMode(this, TextFormattingMode.Ideal);
            icone = new BitmapImage();
            icone.BeginInit(); icone.StreamSource = Assembly.GetExecutingAssembly().GetManifestResourceStream("icone.png"); icone.CacheOption = BitmapCacheOption.OnLoad; icone.EndInit();
            dossier = Programme.DossierImpose ?? Moteur.DossierParDefaut();

            var racine = new Grid();
            var cadre = new Border { Margin = new Thickness(24), CornerRadius = new CornerRadius(32), Background = Pinceau(Fond),
                Effect = new DropShadowEffect { BlurRadius = 44, ShadowDepth = 14, Direction = 270, Opacity = .6, Color = Colors.Black } };
            var contenu = new Grid();
            var coupe = new Border { CornerRadius = new CornerRadius(32), Child = contenu };
            Arrondir(coupe, 32);
            cadre.Child = coupe;
            racine.Children.Add(cadre);
            Content = racine;

            // halos flous derrière tout
            contenu.Children.Add(Halo(-90, -110, 420, 320, "#8C1EA7FF"));
            contenu.Children.Add(Halo(430, 120, 380, 380, "#4D54D8FF"));
            contenu.Children.Add(Halo(230, 360, 480, 300, "#617A6BFF"));

            hote = new Grid { Margin = new Thickness(40, 64, 40, 40) };
            contenu.Children.Add(hote);

            // bouton fermer (rond, verre)
            var fermer = Rond("M6 6l12 12M18 6L6 18", () => { if (!installation) Close(); });
            fermer.HorizontalAlignment = HorizontalAlignment.Right; fermer.VerticalAlignment = VerticalAlignment.Top; fermer.Margin = new Thickness(0, 22, 22, 0);
            contenu.Children.Add(fermer);

            // liseré lumineux du bord de la fenêtre
            contenu.Children.Add(new Border { CornerRadius = new CornerRadius(32), BorderThickness = new Thickness(1.2), IsHitTestVisible = false,
                BorderBrush = Lin(0, 0, 1, 1, "#59F5F7FF", 0, "#0AF5F7FF", .45, "#2EA0E6FF", 1) });

            MouseLeftButtonDown += (s, e) => { if (e.ButtonState == MouseButtonState.Pressed && !(e.OriginalSource is TextBlock)) { try { DragMove(); } catch { } } };
            KeyDown += (s, e) => { if (e.Key == Key.Escape && !installation) Close(); };
            Closing += (s, e) => { if (installation) e.Cancel = true; };

            if (pageApercu == null)
            {
                PageOptions();
                if (Programme.Auto) Loaded += (s, e) => Installer();
            }
            else
            {
                Left = 40; Top = 40;
                Loaded += (s, e) =>
                {
                    if (pageApercu == "options") PageOptions();
                    else if (pageApercu == "installation") { PageInstallation(); MettreAJour(.64, 1); }
                    else if (pageApercu == "termine") { installeDans = dossier; PageTermine(true); }
                    else PageTermine(false);
                    Dispatcher.BeginInvoke(DispatcherPriority.ContextIdle, new Action(() =>
                    {
                        var attente = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(1300) };
                        attente.Tick += (a, b) => { attente.Stop(); Photographier(); };
                        attente.Start();
                    }));
                };
            }
        }

        // ================= pages =================
        void PageOptions()
        {
            var g = Page();
            g.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
            g.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
            var haut = ColonnesIdentite("Heliance Creator", "Version " + K.Version, false, "L'éditeur d'affiches de Heliance Esport");
            var droite = new StackPanel { VerticalAlignment = VerticalAlignment.Top };
            // emplacement
            var t1 = Matiere(26); var l1 = new Grid { Margin = new Thickness(20, 16, 20, 16) };
            l1.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto }); l1.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) }); l1.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            var puce1 = Puce("M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"); Grid.SetColumn(puce1, 0); l1.Children.Add(puce1);
            var col1 = new StackPanel { Margin = new Thickness(14, 0, 14, 0), VerticalAlignment = VerticalAlignment.Center };
            bool miseAJour = Moteur.Existant() != null;   // une installation existe déjà : on la met à jour sur place (on ne change pas son dossier)
            col1.Children.Add(Texte12(miseAJour ? "Mise à jour de ton installation" : "Emplacement"));
            txtDossier = Txt(Raccourcir(dossier), 14.5, FontWeights.Medium, Texte, Corps); txtDossier.ToolTip = dossier; txtDossier.Margin = new Thickness(0, 2, 0, 0);
            col1.Children.Add(txtDossier); Grid.SetColumn(col1, 1); l1.Children.Add(col1);
            if (!miseAJour) { var modif = Pastille("Modifier", false, 36, 18, ChoisirDossier); modif.VerticalAlignment = VerticalAlignment.Center; Grid.SetColumn(modif, 2); l1.Children.Add(modif); }
            t1.Contenu.Children.Add(l1); droite.Children.Add(t1.Exterieur);
            // raccourcis
            var t2 = Matiere(26); var l2 = new StackPanel { Margin = new Thickness(20, 4, 20, 4) };
            l2.Children.Add(LigneInterrupteur("Raccourci sur le Bureau", raccourciBureau, true, v => raccourciBureau = v));
            l2.Children.Add(LigneInterrupteur("Raccourci dans le menu Démarrer", raccourciDemarrer, false, v => raccourciDemarrer = v));
            t2.Contenu.Children.Add(l2); t2.Exterieur.Margin = new Thickness(0, 12, 0, 0); droite.Children.Add(t2.Exterieur);
            // espace
            var ligne = new Grid { Margin = new Thickness(0, 12, 0, 0) };
            ligne.ColumnDefinitions.Add(new ColumnDefinition()); ligne.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(12) }); ligne.ColumnDefinitions.Add(new ColumnDefinition());
            var m1 = Metrique("Espace requis", Mo(K.Octets), null); var m2 = Metrique("Espace disponible", Go(EspaceLibre()), v => txtDispo = v);
            Grid.SetColumn(m1, 0); Grid.SetColumn(m2, 2); ligne.Children.Add(m1); ligne.Children.Add(m2); droite.Children.Add(ligne);
            haut.Children.Add(droite); Grid.SetColumn(droite, 2);
            Grid.SetRow(haut, 0); g.Children.Add(haut);
            var bas = new Grid { Margin = new Thickness(0, 26, 0, 0) };
            var annuler = Pastille("Annuler", false, 36, 18, Close); annuler.HorizontalAlignment = HorizontalAlignment.Left; annuler.VerticalAlignment = VerticalAlignment.Center; bas.Children.Add(annuler);
            var installer = Pastille(miseAJour ? "Mettre à jour" : "Installer", true, 50, 38, Installer); installer.HorizontalAlignment = HorizontalAlignment.Right; bas.Children.Add(installer);
            Grid.SetRow(bas, 1); g.Children.Add(bas);
            Afficher(g);
        }

        void PageInstallation()
        {
            var g = Page();
            g.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
            g.RowDefinitions.Add(new RowDefinition { Height = new GridLength(76) });
            var haut = ColonnesIdentite("Heliance Creator", "Version " + K.Version, false, null);
            var droite = new Grid();
            droite.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto }); droite.RowDefinitions.Add(new RowDefinition { Height = new GridLength(12) }); droite.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
            var t1 = Matiere(26); var p1 = new StackPanel { Margin = new Thickness(24, 22, 24, 20) };
            p1.Children.Add(Texte12("Installation en cours"));
            txtPct = Txt("0 %", 46, FontWeights.SemiBold, Texte, Titres); txtPct.Margin = new Thickness(0, 4, 0, 0); p1.Children.Add(txtPct);
            barreFond = new Border { Height = 12, CornerRadius = new CornerRadius(6), Background = Pinceau("#1AF5F7FF"), HorizontalAlignment = HorizontalAlignment.Stretch };
            remplissage = new Border { Height = 12, CornerRadius = new CornerRadius(6), HorizontalAlignment = HorizontalAlignment.Left, Width = 0, Background = Lin(0, 0, 1, 0, "#FF1EA7FF", 0, "#FF54D8FF", 1),
                Effect = new DropShadowEffect { BlurRadius = 16, ShadowDepth = 0, Color = (Color)ColorConverter.ConvertFromString("#FF54D8FF"), Opacity = .6 } };
            var barre = new Grid { Margin = new Thickness(0, 16, 0, 0) }; barre.Children.Add(barreFond); barre.Children.Add(remplissage); p1.Children.Add(barre);
            t1.Contenu.Children.Add(p1); Grid.SetRow(t1.Exterieur, 0); droite.Children.Add(t1.Exterieur);
            var t2 = Matiere(26); var p2 = new StackPanel { Margin = new Thickness(24, 8, 24, 8), VerticalAlignment = VerticalAlignment.Center };
            string[] noms = { "Préparation", "Copie des fichiers", "Raccourcis" };
            for (int i = 0; i < 3; i++)
            {
                var ligne = new StackPanel { Orientation = Orientation.Horizontal, Height = 40 };
                points[i] = new Border { Width = 22, Height = 22, CornerRadius = new CornerRadius(11), VerticalAlignment = VerticalAlignment.Center, BorderThickness = new Thickness(2), BorderBrush = Pinceau("#33F5F7FF") };
                etapes[i] = Txt(noms[i], 14.5, FontWeights.Normal, Doux, Corps); etapes[i].Margin = new Thickness(12, 0, 0, 0); etapes[i].VerticalAlignment = VerticalAlignment.Center;
                ligne.Children.Add(points[i]); ligne.Children.Add(etapes[i]); p2.Children.Add(ligne);
            }
            t2.Contenu.Children.Add(p2); Grid.SetRow(t2.Exterieur, 2); droite.Children.Add(t2.Exterieur);
            haut.Children.Add(droite); Grid.SetColumn(droite, 2);
            Grid.SetRow(haut, 0); g.Children.Add(haut);
            pctAffiche = 0;
            Afficher(g);
        }

        void PageTermine(bool reussi)
        {
            var g = Page();
            g.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
            g.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
            var haut = ColonnesIdentite(reussi ? "C'est prêt" : "Oups", reussi ? "Version " + K.Version + " installée" : "L'installation n'a pas abouti", reussi, null);
            var droite = new StackPanel { VerticalAlignment = VerticalAlignment.Top };
            if (reussi)
            {
                droite.Children.Add(LigneInfo("M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM8 21h8M12 16v5", "Raccourci sur le Bureau", raccourciBureau ? "Ajouté" : "Non ajouté"));
                var d2 = LigneInfo("M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z", "Menu Démarrer", raccourciDemarrer ? "Ajouté" : "Non ajouté"); d2.Margin = new Thickness(0, 12, 0, 0); droite.Children.Add(d2);
                var t = Matiere(26); var p = new StackPanel { Margin = new Thickness(20, 18, 20, 18) };
                p.Children.Add(Texte12("Premier lancement"));
                var tx = Txt("Configure ta structure une fois : son nom et son logo seront repris dans toutes tes affiches.", 14.5, FontWeights.Normal, Texte, Corps); tx.TextWrapping = TextWrapping.Wrap; tx.Margin = new Thickness(0, 4, 0, 0);
                p.Children.Add(tx); t.Contenu.Children.Add(p); t.Exterieur.Margin = new Thickness(0, 12, 0, 0); droite.Children.Add(t.Exterieur);
            }
            else
            {
                var t = Matiere(26); var p = new StackPanel { Margin = new Thickness(22, 20, 22, 20) };
                p.Children.Add(Texte12("Que s'est-il passé ?"));
                var tx = Txt("Windows a interrompu l'installation (code " + codeSortie + "). Tu peux réessayer. Si cela se reproduit, ferme les autres programmes ou choisis un autre dossier.", 14.5, FontWeights.Normal, Texte, Corps);
                tx.TextWrapping = TextWrapping.Wrap; tx.Margin = new Thickness(0, 6, 0, 0); p.Children.Add(tx); t.Contenu.Children.Add(p); droite.Children.Add(t.Exterieur);
            }
            haut.Children.Add(droite); Grid.SetColumn(droite, 2);
            Grid.SetRow(haut, 0); g.Children.Add(haut);
            var bas = new Grid { Margin = new Thickness(0, 26, 0, 0) };
            var fermer = Pastille("Fermer", false, 36, 18, Close); fermer.HorizontalAlignment = HorizontalAlignment.Left; fermer.VerticalAlignment = VerticalAlignment.Center; bas.Children.Add(fermer);
            FrameworkElement action = reussi ? Pastille("Ouvrir Heliance Creator", true, 50, 38, Ouvrir) : Pastille("Réessayer", true, 50, 38, PageOptions);
            action.HorizontalAlignment = HorizontalAlignment.Right; bas.Children.Add(action);
            Grid.SetRow(bas, 1); g.Children.Add(bas);
            Afficher(g);
        }

        // ================= actions =================
        void ChoisirDossier()
        {
            using (var d = new System.Windows.Forms.FolderBrowserDialog())
            {
                d.Description = "Choisis le dossier dans lequel installer Heliance Creator";
                d.SelectedPath = IOPath.GetDirectoryName(dossier) ?? dossier;
                if (d.ShowDialog() == System.Windows.Forms.DialogResult.OK)
                {
                    string choisi = d.SelectedPath.TrimEnd('\\');
                    dossier = string.Equals(IOPath.GetFileName(choisi), K.Dossier, StringComparison.OrdinalIgnoreCase) ? choisi : IOPath.Combine(choisi, K.Dossier);
                    txtDossier.Text = Raccourcir(dossier); txtDossier.ToolTip = dossier;
                    if (txtDispo != null) txtDispo.Text = Go(EspaceLibre());
                }
            }
        }

        void Installer()
        {
            installation = true;
            codeSortie = 0;
            string cible = dossier;
            PageInstallation();
            MettreAJour(0.01, 0);
            var fil = new Thread(() =>
            {
                string moteurExe = null;
                try
                {
                    moteurExe = Moteur.Extraire();
                    Ui(() => MettreAJour(0.04, 1));
                    // installation « pour moi » (sans autorisation) ; si une installation « pour tous » existe déjà, on la met à jour au même endroit (Windows demande son autorisation)
                    bool pourTous = Moteur.Existant() != null && Moteur.ParMachine;
                    if (pourTous) cible = Moteur.Existant();
                    long depart = TailleDossier(cible);
                    var debut = DateTime.UtcNow;
                    var p = Process.Start(new ProcessStartInfo(moteurExe, "/S " + (pourTous ? "/allusers" : "/currentuser") + " /D=" + cible) { UseShellExecute = false });
                    while (!p.WaitForExit(350))
                    {
                        // la progression suit les fichiers qui arrivent ; pour une mise à jour (dossier déjà plein), elle suit le temps
                        double taille = Math.Max(0, TailleDossier(cible) - depart) / Math.Max(1.0, (double)(K.Octets - depart));
                        double temps = 1 - Math.Exp(-(DateTime.UtcNow - debut).TotalSeconds / 14.0);
                        double part = Math.Min(1.0, Math.Max(taille, depart > K.Octets * 0.5 ? temps * 0.9 : 0));
                        Ui(() => MettreAJour(0.04 + 0.9 * part, 1));
                    }
                    codeSortie = p.ExitCode;
                    if (codeSortie == 0)
                    {
                        Ui(() => MettreAJour(0.96, 2));
                        string reel = Moteur.Existant();
                        installeDans = string.IsNullOrEmpty(reel) ? cible : reel;
                        if (!raccourciBureau) Supprimer(IOPath.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), K.Raccourci + ".lnk"));
                        if (!raccourciDemarrer) Supprimer(IOPath.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), K.Raccourci + ".lnk"));
                        Thread.Sleep(500);
                        Ui(() => MettreAJour(1.0, 3));
                        Thread.Sleep(450);
                    }
                }
                catch (Exception) { if (codeSortie == 0) codeSortie = -1; }
                finally { if (moteurExe != null) Moteur.Nettoyer(moteurExe); }
                Ui(() => { installation = false; PageTermine(codeSortie == 0); });
            });
            fil.IsBackground = true; fil.Start();
        }

        void Ouvrir()
        {
            try
            {
                string baseDir = string.IsNullOrEmpty(installeDans) ? dossier : installeDans;
                string exe = IOPath.Combine(baseDir, K.Exe);
                if (File.Exists(exe)) Process.Start(new ProcessStartInfo(exe) { WorkingDirectory = baseDir, UseShellExecute = true });
            }
            catch { }
            Close();
        }

        static void Supprimer(string f) { try { if (File.Exists(f)) File.Delete(f); } catch { } }
        void Ui(Action a) { Dispatcher.Invoke(a); }

        void MettreAJour(double part, int etape)
        {
            if (txtPct == null) return;
            pctAffiche = Math.Max(pctAffiche, part);
            txtPct.Text = Math.Min(100, (int)Math.Round(pctAffiche * 100)) + " %";
            double largeur = Math.Max(0, (barreFond.ActualWidth > 0 ? barreFond.ActualWidth : 330) * pctAffiche);
            remplissage.BeginAnimation(FrameworkElement.WidthProperty, new DoubleAnimation(largeur, TimeSpan.FromMilliseconds(320)) { EasingFunction = new CubicEase { EasingMode = EasingMode.EaseOut } });
            for (int i = 0; i < 3; i++)
            {
                if (i < etape) { points[i].Background = Pinceau("#2E54D8FF"); points[i].BorderBrush = Brushes.Transparent; points[i].Child = Coche(Cyan); etapes[i].Foreground = Pinceau(Doux); etapes[i].FontWeight = FontWeights.Normal; }
                else if (i == etape) { points[i].Background = Brushes.Transparent; points[i].BorderBrush = Pinceau(Cyan); points[i].Child = new Border { Width = 8, Height = 8, CornerRadius = new CornerRadius(4), Background = Pinceau(Cyan), HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center }; etapes[i].Foreground = Pinceau(Texte); etapes[i].FontWeight = FontWeights.Medium; }
            }
        }

        static long TailleDossier(string d)
        {
            long total = 0;
            try { foreach (var f in new DirectoryInfo(d).EnumerateFiles("*", SearchOption.AllDirectories)) { try { total += f.Length; } catch { } } } catch { }
            return total;
        }

        void Photographier()
        {
            var racine = (FrameworkElement)Content;
            racine.UpdateLayout();
            var rtb = new RenderTargetBitmap((int)Width * 2, (int)Height * 2, 192, 192, PixelFormats.Pbgra32);
            rtb.Render(racine);
            var enc = new PngBitmapEncoder(); enc.Frames.Add(BitmapFrame.Create(rtb));
            using (var s = File.Create(sortieApercu)) enc.Save(s);
            Application.Current.Shutdown(0);
        }

        // ================= blocs d'interface =================
        Grid Page() { return new Grid { Opacity = 0 }; }

        void Afficher(UIElement page)
        {
            var ancienne = pageCourante;
            pageCourante = page;
            hote.Children.Add(page);
            var decalage = new TranslateTransform(24, 0);
            page.RenderTransform = decalage;
            var ease = new CubicEase { EasingMode = EasingMode.EaseOut };
            var debut = TimeSpan.FromMilliseconds(ancienne == null ? 0 : 140);
            page.BeginAnimation(UIElement.OpacityProperty, new DoubleAnimation(0, 1, TimeSpan.FromMilliseconds(380)) { EasingFunction = ease, BeginTime = debut });
            decalage.BeginAnimation(TranslateTransform.XProperty, new DoubleAnimation(24, 0, TimeSpan.FromMilliseconds(460)) { EasingFunction = ease, BeginTime = debut });
            if (ancienne != null)
            {
                var fondu = new DoubleAnimation(0, TimeSpan.FromMilliseconds(160));
                fondu.Completed += (s, e) => hote.Children.Remove(ancienne);
                ancienne.BeginAnimation(UIElement.OpacityProperty, fondu);
            }
        }

        /// <summary>Grande tuile d'identité à gauche + colonne de droite (que l'appelant remplit).</summary>
        Grid ColonnesIdentite(string titre, string sous, bool coche, string phrase)
        {
            var g = new Grid();
            g.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(230) });
            g.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(22) });
            g.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            var t = Verre(34);
            var pile = new StackPanel { VerticalAlignment = VerticalAlignment.Center, HorizontalAlignment = HorizontalAlignment.Center };
            var logo = new Grid { Width = 92, Height = 92, HorizontalAlignment = HorizontalAlignment.Center };
            logo.Children.Add(new Border { CornerRadius = new CornerRadius(26), Background = new ImageBrush(icone), Effect = new DropShadowEffect { BlurRadius = 28, ShadowDepth = 12, Direction = 270, Opacity = .5, Color = Colors.Black } });
            if (coche)
            {
                var badge = new Border { Width = 40, Height = 40, CornerRadius = new CornerRadius(20), HorizontalAlignment = HorizontalAlignment.Right, VerticalAlignment = VerticalAlignment.Bottom, Margin = new Thickness(0, 0, -14, -14),
                    Background = Lin(0, 0, 1, 1, "#FFA8EBFF", 0, "#FF54D8FF", .55, "#FF33BDEE", 1), BorderBrush = Pinceau("#FF10152F"), BorderThickness = new Thickness(4),
                    Effect = new DropShadowEffect { BlurRadius = 20, ShadowDepth = 6, Direction = 270, Opacity = .45, Color = (Color)ColorConverter.ConvertFromString("#FF54D8FF") } };
                badge.Child = Coche("#FF04121C", 2.6, 19); logo.Children.Add(badge);
            }
            pile.Children.Add(logo);
            var h = Txt(titre, 22, FontWeights.SemiBold, Texte, Titres); h.HorizontalAlignment = HorizontalAlignment.Center; h.Margin = new Thickness(0, 22, 0, 0); pile.Children.Add(h);
            var s = Txt(sous, 13.5, FontWeights.Normal, "#FFC9CFEA", Corps); s.HorizontalAlignment = HorizontalAlignment.Center; s.Margin = new Thickness(0, 5, 0, 0); pile.Children.Add(s);
            if (phrase != null)
            {
                var p = Txt(phrase, 12.5, FontWeights.Normal, Doux, Corps); p.TextAlignment = TextAlignment.Center; p.TextWrapping = TextWrapping.Wrap; p.MaxWidth = 170; p.Margin = new Thickness(0, 12, 0, 0); pile.Children.Add(p);
            }
            t.Contenu.Children.Add(pile);
            g.Children.Add(t.Exterieur);
            return g;
        }

        FrameworkElement LigneInfo(string trace, string titre, string etat)
        {
            var t = Matiere(26); var l = new Grid { Margin = new Thickness(20, 16, 20, 16) };
            l.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto }); l.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            l.Children.Add(Puce(trace));
            var c = new StackPanel { Margin = new Thickness(14, 0, 0, 0), VerticalAlignment = VerticalAlignment.Center };
            c.Children.Add(Txt(titre, 15, FontWeights.Medium, Texte, Corps)); var e = Txt(etat, 12.5, FontWeights.Normal, Doux, Corps); e.Margin = new Thickness(0, 2, 0, 0); c.Children.Add(e);
            Grid.SetColumn(c, 1); l.Children.Add(c); t.Contenu.Children.Add(l);
            return t.Exterieur;
        }

        FrameworkElement LigneInterrupteur(string texte, bool etat, bool separateur, Action<bool> change)
        {
            var g = new Grid { Height = 56 };
            if (separateur) g.Children.Add(new Border { Height = 1, VerticalAlignment = VerticalAlignment.Bottom, Background = Pinceau("#14F5F7FF") });
            g.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) }); g.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            var t = Txt(texte, 15, FontWeights.Medium, Texte, Corps); t.VerticalAlignment = VerticalAlignment.Center; g.Children.Add(t);
            var sw = Interrupteur(etat, change); Grid.SetColumn(sw, 1); sw.VerticalAlignment = VerticalAlignment.Center; g.Children.Add(sw);
            return g;
        }

        FrameworkElement Metrique(string titre, string valeur, Action<TextBlock> reference)
        {
            var t = Matiere(26); var p = new StackPanel { Margin = new Thickness(20, 14, 20, 14) };
            p.Children.Add(Texte12(titre)); var v = Txt(valeur, 20, FontWeights.SemiBold, Texte, Titres); v.Margin = new Thickness(0, 3, 0, 0); p.Children.Add(v);
            if (reference != null) reference(v);
            t.Contenu.Children.Add(p); return t.Exterieur;
        }

        TextBlock Texte12(string s) { return Txt(s, 12.5, FontWeights.Normal, Doux, Corps); }

        static TextBlock Txt(string s, double taille, FontWeight poids, string couleur, FontFamily police)
        {
            return new TextBlock { Text = s, FontSize = taille, FontWeight = poids, Foreground = Pinceau(couleur), FontFamily = police };
        }

        Border Puce(string trace)
        {
            var b = new Border { Width = 40, Height = 40, CornerRadius = new CornerRadius(13), Background = Pinceau("#2454D8FF"), VerticalAlignment = VerticalAlignment.Center };
            b.Child = Icone(trace, Cyan, 21, 1.9); return b;
        }

        static FrameworkElement Icone(string trace, string couleur, double taille, double epaisseur)
        {
            var p = new Shapes.Path { Data = Geometry.Parse(trace), Stroke = Pinceau(couleur), StrokeThickness = epaisseur, StrokeLineJoin = PenLineJoin.Round, StrokeStartLineCap = PenLineCap.Round, StrokeEndLineCap = PenLineCap.Round };
            var grille = new Grid { Width = 24, Height = 24 }; grille.Children.Add(p);
            return new Viewbox { Width = taille, Height = taille, Child = grille, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center };
        }

        static FrameworkElement Coche(string couleur) { return Coche(couleur, 3, 13); }
        static FrameworkElement Coche(string couleur, double epaisseur, double taille) { return Icone("M5 12.5l4.5 4.5L19 7.5", couleur, taille, epaisseur); }

        // ---- matières ----
        Tuile Verre(double rayon)
        {
            var ext = new Border { CornerRadius = new CornerRadius(rayon), Effect = new DropShadowEffect { BlurRadius = 44, ShadowDepth = 18, Direction = 270, Opacity = .45, Color = Colors.Black } };
            var interieur = new Border { CornerRadius = new CornerRadius(rayon), Background = Lin(0, 0, .7, 1, "#2BF5F7FF", 0, "#0AF5F7FF", .5, "#1AF5F7FF", 1) };
            Arrondir(interieur, rayon);
            var g = new Grid();
            g.Children.Add(new Border { VerticalAlignment = VerticalAlignment.Bottom, Height = 90, Background = Lin(0, 0, 0, 1, "#0054D8FF", 0, "#4278D6FF", 1), IsHitTestVisible = false });
            g.Children.Add(new Border { Background = new RadialGradientBrush { Center = new Point(.25, 0), GradientOrigin = new Point(.25, 0), RadiusX = .9, RadiusY = .6, GradientStops = { new GradientStop(Color.FromArgb(0x57, 255, 255, 255), 0), new GradientStop(Color.FromArgb(0, 255, 255, 255), 1) } }, IsHitTestVisible = false });
            interieur.Child = g;
            var rim = new Border { CornerRadius = new CornerRadius(rayon), BorderThickness = new Thickness(1.1), IsHitTestVisible = false, BorderBrush = Lin(0, 0, 1, 1, "#D9F5F7FF", 0, "#29F5F7FF", .3, "#12F5F7FF", .7, "#99A0E6FF", 1) };
            var racine = new Grid(); racine.Children.Add(interieur); racine.Children.Add(rim);
            ext.Child = racine;
            return new Tuile { Exterieur = ext, Contenu = g };
        }

        Tuile Matiere(double rayon)
        {
            var ext = new Border { CornerRadius = new CornerRadius(rayon) };
            var interieur = new Border { CornerRadius = new CornerRadius(rayon), Background = Lin(.2, 0, .8, 1, "#EB1A1F3A", 0, "#EB11152A", 1), BorderThickness = new Thickness(1), BorderBrush = Lin(0, 0, 0, 1, "#26F5F7FF", 0, "#0FF5F7FF", 1) };
            var g = new Grid(); interieur.Child = g; ext.Child = interieur;
            return new Tuile { Exterieur = ext, Contenu = g };
        }

        FrameworkElement Halo(double x, double y, double l, double h, string couleur)
        {
            var c = (Color)ColorConverter.ConvertFromString(couleur);
            var e = new Shapes.Ellipse { Width = l, Height = h, Effect = new BlurEffect { Radius = 54 }, IsHitTestVisible = false,
                Fill = new RadialGradientBrush { GradientStops = { new GradientStop(c, 0), new GradientStop(Color.FromArgb(0, c.R, c.G, c.B), 1) } } };
            e.HorizontalAlignment = HorizontalAlignment.Left; e.VerticalAlignment = VerticalAlignment.Top; e.Margin = new Thickness(x, y, 0, 0);
            return e;
        }

        // ---- contrôles ----
        FrameworkElement Pastille(string texte, bool principal, double hauteur, double marge, Action clic)
        {
            var b = new Border { Height = hauteur, CornerRadius = new CornerRadius(hauteur / 2), Cursor = Cursors.Hand, RenderTransformOrigin = new Point(.5, .5), RenderTransform = new ScaleTransform(1, 1), Padding = new Thickness(marge, 0, marge, 0) };
            if (principal)
            {
                b.Background = Lin(.2, 0, .8, 1, "#FFA8EBFF", 0, "#FF54D8FF", .55, "#FF33BDEE", 1);
                b.Effect = new DropShadowEffect { BlurRadius = 30, ShadowDepth = 10, Direction = 270, Opacity = .4, Color = (Color)ColorConverter.ConvertFromString("#FF54D8FF") };
            }
            else b.Background = Pinceau("#1AF5F7FF");
            var t = Txt(texte, principal ? 16 : 13.5, principal ? FontWeights.SemiBold : FontWeights.Medium, principal ? "#FF04121C" : Texte, principal ? Titres : Corps);
            // le milieu des lettres tombe plus bas que le milieu de la ligne (police Segoe) : on remonte le texte de 1 px pour qu'il soit au centre du bouton ; le filet du haut est un calque (une bordure décalerait le texte)
            t.VerticalAlignment = VerticalAlignment.Center; t.HorizontalAlignment = HorizontalAlignment.Center; t.Margin = new Thickness(0, 0, 0, 2);
            if (principal) b.Child = t;
            else
            {
                var g = new Grid();
                g.Children.Add(new Border { Margin = new Thickness(-marge, 0, -marge, 0), CornerRadius = new CornerRadius(hauteur / 2), BorderThickness = new Thickness(1), BorderBrush = Lin(0, 0, 0, 1, "#40F5F7FF", 0, "#00F5F7FF", .55), IsHitTestVisible = false });
                g.Children.Add(t);
                b.Child = g;
            }
            Action<double> echelle = v =>
            {
                var st = (ScaleTransform)b.RenderTransform;
                var a = new DoubleAnimation(v, TimeSpan.FromMilliseconds(180)) { EasingFunction = new BackEase { EasingMode = EasingMode.EaseOut, Amplitude = .4 } };
                st.BeginAnimation(ScaleTransform.ScaleXProperty, a); st.BeginAnimation(ScaleTransform.ScaleYProperty, a);
            };
            b.MouseEnter += (s, e) => echelle(1.04); b.MouseLeave += (s, e) => echelle(1);
            b.MouseLeftButtonDown += (s, e) => { echelle(.96); e.Handled = true; };
            b.MouseLeftButtonUp += (s, e) => { echelle(1.04); if (clic != null) clic(); e.Handled = true; };
            return b;
        }

        FrameworkElement Rond(string trace, Action clic)
        {
            var t = Verre(17);
            t.Exterieur.Width = 34; t.Exterieur.Height = 34; t.Exterieur.Cursor = Cursors.Hand; t.Exterieur.Effect = null;
            t.Contenu.Children.Add(Icone(trace, "#FFE8EBFA", 15, 2.2));
            t.Exterieur.MouseLeftButtonUp += (s, e) => { if (clic != null) clic(); e.Handled = true; };
            t.Exterieur.MouseLeftButtonDown += (s, e) => { e.Handled = true; };
            return t.Exterieur;
        }

        FrameworkElement Interrupteur(bool etat, Action<bool> change)
        {
            var piste = new Border { Width = 46, Height = 28, CornerRadius = new CornerRadius(14), Cursor = Cursors.Hand };
            var bouton = new Border { Width = 22, Height = 22, CornerRadius = new CornerRadius(11), Background = Brushes.White, HorizontalAlignment = HorizontalAlignment.Left, Margin = new Thickness(3), RenderTransform = new TranslateTransform(0, 0),
                Effect = new DropShadowEffect { BlurRadius = 6, ShadowDepth = 2, Direction = 270, Opacity = .35, Color = Colors.Black } };
            var g = new Grid(); g.Children.Add(bouton); piste.Child = g;
            bool actif = etat;
            Action<bool> couleur = oui => { piste.Background = oui ? (Brush)Lin(.2, 0, .8, 1, "#FFA8EBFF", 0, "#FF54D8FF", .55, "#FF33BDEE", 1) : Pinceau("#33F5F7FF"); };
            ((TranslateTransform)bouton.RenderTransform).X = actif ? 18 : 0;
            couleur(actif);
            piste.MouseLeftButtonUp += (s, e) =>
            {
                actif = !actif; couleur(actif); change(actif);
                ((TranslateTransform)bouton.RenderTransform).BeginAnimation(TranslateTransform.XProperty, new DoubleAnimation(actif ? 18 : 0, TimeSpan.FromMilliseconds(260)) { EasingFunction = new BackEase { EasingMode = EasingMode.EaseOut, Amplitude = .5 } });
                e.Handled = true;
            };
            return piste;
        }

        // ---- utilitaires ----
        static SolidColorBrush Pinceau(string c) { var b = new SolidColorBrush((Color)ColorConverter.ConvertFromString(c)); b.Freeze(); return b; }

        /// <summary>Dégradé linéaire : points de départ et d'arrivée (0 à 1), puis des paires couleur / position.</summary>
        static LinearGradientBrush Lin(double x0, double y0, double x1, double y1, params object[] arrets)
        {
            var b = new LinearGradientBrush { StartPoint = new Point(x0, y0), EndPoint = new Point(x1, y1) };
            for (int i = 0; i + 1 < arrets.Length; i += 2) b.GradientStops.Add(new GradientStop((Color)ColorConverter.ConvertFromString((string)arrets[i]), Convert.ToDouble(arrets[i + 1])));
            return b;
        }

        static void Arrondir(Border b, double rayon)
        {
            b.SizeChanged += (s, e) => { b.Clip = new RectangleGeometry(new Rect(0, 0, b.ActualWidth, b.ActualHeight), rayon, rayon); };
        }

        /// <summary>Chemin trop long pour la tuile : on garde la fin (le plus utile), précédée de « … ».</summary>
        static string Raccourcir(string chemin)
        {
            const int max = 34;
            if (chemin.Length <= max) return chemin;
            string fin = chemin.Substring(chemin.Length - (max - 2));
            int coupe = fin.IndexOf('\\');
            return "…" + (coupe >= 0 ? fin.Substring(coupe) : fin);
        }
        static long EspaceLibreDe(string d)
        {
            try { return new DriveInfo(IOPath.GetPathRoot(d)).AvailableFreeSpace; } catch { return 0; }
        }
        long EspaceLibre() { return EspaceLibreDe(dossier); }
        static string Mo(long octets) { return (Math.Ceiling(octets / 1048576.0 / 10) * 10).ToString("0") + " Mo"; }
        static string Go(long octets) { double g = octets / 1073741824.0; return g >= 10 ? Math.Floor(g).ToString("0") + " Go" : g.ToString("0.0") + " Go"; }
    }
}
