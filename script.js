// Récupère l'ID dans l'URL
const params = new URLSearchParams(window.location.search);
const id = params.get("id") || "oriane"; // valeur par défaut

// Configure le bouton de téléchargement du contact
const btn = document.getElementById("download-contact");
if (btn) {
  btn.href = `${id}.vcf`;
  btn.setAttribute("download", `${id}.vcf`);
}
