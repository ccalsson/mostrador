using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Windows.Forms;

static class Program
{
    [STAThread]
    static void Main()
    {
        try
        {
            string destino = Path.Combine(Path.GetTempPath(), "Mostrador-Instalacion");
            if (Directory.Exists(destino)) Directory.Delete(destino, true);
            Directory.CreateDirectory(destino);

            string zip = Path.Combine(destino, "Mostrador-Windows-0.2.0-dev.zip");
            using (Stream entrada = Assembly.GetExecutingAssembly().GetManifestResourceStream("payload.zip"))
            {
                if (entrada == null) throw new Exception("Recurso interno no encontrado.");
                using (FileStream salida = File.Create(zip)) entrada.CopyTo(salida);
            }

            ZipFile.ExtractToDirectory(zip, destino);
            File.Delete(zip);

            string instalador = Path.Combine(destino, "Instalar.cmd");
            if (!File.Exists(instalador))
                throw new Exception("No se encontro Instalar.cmd tras la extraccion.");

            using (Process proceso = Process.Start(new ProcessStartInfo("cmd.exe", "/c \"" + instalador + "\"") { UseShellExecute = true }))
            {
                proceso.WaitForExit();
            }
            try { Directory.Delete(destino, true); } catch { }
        }
        catch (Exception error)
        {
            MessageBox.Show("No se pudo instalar Mostrador:\n" + error.Message, "Mostrador",
                MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }
}
