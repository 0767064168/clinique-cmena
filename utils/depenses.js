const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FILE_PATH = path.join(__dirname, '..', 'data', 'depenses_caisse.json');

function ensureDataFile() {
    if (!fs.existsSync(FILE_PATH)) {
        const dir = path.dirname(FILE_PATH);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(FILE_PATH, '[]', 'utf8');
    }
}

function readAllDepenses() {
    try {
        ensureDataFile();
        const content = fs.readFileSync(FILE_PATH, 'utf8');
        return JSON.parse(content || '[]');
    } catch (err) {
        console.error('Erreur lecture depenses_caisse.json:', err);
        return [];
    }
}

function writeAllDepenses(depenses) {
    try {
        ensureDataFile();
        fs.writeFileSync(FILE_PATH, JSON.stringify(depenses, null, 2), 'utf8');
        return true;
    } catch (err) {
        console.error('Erreur ecriture depenses_caisse.json:', err);
        return false;
    }
}

function getDepensesByDate(dateStr) {
    const targetDate = dateStr || new Date().toISOString().split('T')[0];
    const all = readAllDepenses();
    return all.filter(d => d.date === targetDate);
}

function addDepense({ date, motif, montant, beneficiaire, categorie, utilisateur_nom }) {
    const all = readAllDepenses();
    const targetDate = date || new Date().toISOString().split('T')[0];
    const newDepense = {
        id: crypto.randomUUID(),
        date: targetDate,
        heure: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        motif: (motif || 'Dépense diverse').trim(),
        montant: Math.max(0, parseFloat(montant) || 0),
        beneficiaire: (beneficiaire || '-').trim(),
        categorie: categorie || 'autre',
        utilisateur_nom: utilisateur_nom || 'Caissier',
        created_at: new Date().toISOString()
    };
    all.push(newDepense);
    writeAllDepenses(all);
    return newDepense;
}

function deleteDepense(id) {
    const all = readAllDepenses();
    const filtered = all.filter(d => d.id !== id);
    writeAllDepenses(filtered);
    return true;
}

module.exports = {
    getDepensesByDate,
    addDepense,
    deleteDepense,
    readAllDepenses
};
