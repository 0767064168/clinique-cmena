/**
 * Helper de gestion des constantes cliniques et du dossier médical de consultation
 * Permet d'encoder et de décoder fidèlement l'ensemble de la fiche d'examen clinique (CSA / GSPM) :
 * - Constantes physiques (Poids, Taille, IMC, Z-score, Température, TA, Pouls, FR, PB, PC)
 * - Dépistage Tuberculose (Recherche active, signes d'imprégnation)
 * - Examen physique & Diagnostics associés
 * - Examens complémentaires (TDR Paludisme, Goutte Épaisse, CDIP VIH, Glycémie, Autres examens)
 * - Traitement & MILDA
 * - Issue de la consultation & Décisions (Sorti, M.O, Hospitalisé, Référé, Repos / Exemption / Modèle 8 militaire)
 */

const CLINICAL_START = '--- DOSSIER MEDICAL CLINIQUE ---';
const CLINICAL_END = '--- FIN DOSSIER MEDICAL ---';
const LEGACY_VITALS_START = '--- CONSTANTES VITALES ---';
const LEGACY_VITALS_END = '--- FIN CONSTANTES ---';

/**
 * Encode toutes les données cliniques de la fiche médicale dans le texte d'observations
 */
function packClinicalData(observationsText, data) {
    const obs = (observationsText || '').trim();
    const clinical = {};
    let hasData = false;

    const fields = [
        // Constantes physiques
        'poids', 'taille', 'imc', 'zscore', 'temperature', 'tension', 'pouls',
        'frequence_respiratoire', 'perimetre_brachial', 'perimetre_cranien',
        // Tuberculose
        'recherche_tb', 'signes_tb',
        // Examen physique
        'examen_physique', 'autres_pathologies',
        // Examens complémentaires
        'tdr_palu', 'goutte_epaisse', 'cdip_propose', 'cdip_realise', 'code_depistage',
        'glycemie', 'glycemie_type', 'autres_examens',
        // Traitement & MILDA
        'traitement_prescrit', 'milda_eligible', 'milda_remis',
        // Issue & Arrêt / Modèle 8
        'issue_consultation', 'mo_debut', 'mo_fin',
        'decision_repos', 'repos_type', 'repos_nb_jours', 'repos_duree'
    ];

    if (data && typeof data === 'object') {
        fields.forEach(f => {
            if (data[f] !== undefined && data[f] !== null && String(data[f]).trim() !== '') {
                clinical[f] = String(data[f]).trim();
                hasData = true;
            }
        });
    }

    if (!hasData) {
        return obs;
    }

    const payload = `${CLINICAL_START}\n${JSON.stringify(clinical, null, 2)}\n${CLINICAL_END}`;
    if (obs) {
        return `${payload}\n\n${obs}`;
    }
    return payload;
}

/**
 * Décode les données cliniques et extrait le texte d'observations libres
 */
function unpackClinicalData(rawText) {
    const result = {
        // Constantes physiques
        poids: '',
        taille: '',
        imc: '',
        zscore: '',
        temperature: '',
        tension: '',
        pouls: '',
        frequence_respiratoire: '',
        perimetre_brachial: '',
        perimetre_cranien: '',
        // Tuberculose
        recherche_tb: '',
        signes_tb: '',
        // Examen physique
        examen_physique: '',
        autres_pathologies: '',
        // Examens complémentaires
        tdr_palu: '',
        goutte_epaisse: '',
        cdip_propose: '',
        cdip_realise: '',
        code_depistage: '',
        glycemie: '',
        glycemie_type: '',
        autres_examens: '',
        // Traitement & MILDA
        traitement_prescrit: '',
        milda_eligible: '',
        milda_remis: '',
        // Issue de consultation
        issue_consultation: '',
        mo_debut: '',
        mo_fin: '',
        decision_repos: '',
        repos_type: '',
        repos_nb_jours: '',
        repos_duree: '',
        // Observations
        cleanObservations: rawText || ''
    };

    if (!rawText || typeof rawText !== 'string') {
        return result;
    }

    // 1. Décodage du format moderne JSON
    const cStart = rawText.indexOf(CLINICAL_START);
    const cEnd = rawText.indexOf(CLINICAL_END);

    if (cStart !== -1 && cEnd !== -1 && cEnd > cStart) {
        const jsonBlock = rawText.substring(cStart + CLINICAL_START.length, cEnd).trim();
        try {
            const parsed = JSON.parse(jsonBlock);
            Object.assign(result, parsed);
        } catch (e) {
            console.error('Erreur parsing json clinique:', e.message);
        }
        const before = rawText.substring(0, cStart).trim();
        const after = rawText.substring(cEnd + CLINICAL_END.length).trim();
        result.cleanObservations = [before, after].filter(Boolean).join('\n\n');
        return result;
    }

    // 2. Décodage rétrocompatible du format historique
    const vStart = rawText.indexOf(LEGACY_VITALS_START);
    const vEnd = rawText.indexOf(LEGACY_VITALS_END);

    if (vStart !== -1 && vEnd !== -1 && vEnd > vStart) {
        const block = rawText.substring(vStart + LEGACY_VITALS_START.length, vEnd);
        block.split('\n').forEach(line => {
            const trimmed = line.trim();
            if (trimmed.startsWith('Tension:')) result.tension = trimmed.replace('Tension:', '').trim();
            else if (trimmed.startsWith('Temperature:')) result.temperature = trimmed.replace('Temperature:', '').trim();
            else if (trimmed.startsWith('Poids:')) result.poids = trimmed.replace('Poids:', '').trim();
            else if (trimmed.startsWith('Taille:')) result.taille = trimmed.replace('Taille:', '').trim();
            else if (trimmed.startsWith('Pouls:')) result.pouls = trimmed.replace('Pouls:', '').trim();
        });

        const before = rawText.substring(0, vStart).trim();
        const after = rawText.substring(vEnd + LEGACY_VITALS_END.length).trim();
        result.cleanObservations = [before, after].filter(Boolean).join('\n\n');
    }

    return result;
}

// Aliases rétrocompatibles
const packVitals = packClinicalData;
const unpackVitals = unpackClinicalData;

module.exports = {
    packClinicalData,
    unpackClinicalData,
    packVitals,
    unpackVitals
};
