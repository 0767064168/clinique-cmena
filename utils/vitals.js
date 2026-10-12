/**
 * Helper de gestion des constantes vitales médicales
 * Permet d'encoder et de décoder proprement les constantes dans les observations de consultation
 * sans nécessiter de modification de schéma SQL externe.
 */

const VITALS_START = '--- CONSTANTES VITALES ---';
const VITALS_END = '--- FIN CONSTANTES ---';

/**
 * Encode les constantes vitales et les observations en un seul texte formaté
 */
function packVitals(observationsText, vitals) {
    const lines = [];
    const obs = (observationsText || '').trim();

    const { tension, temperature, poids, taille, pouls } = vitals || {};
    const hasVitals = tension || temperature || poids || taille || pouls;

    if (!hasVitals) {
        return obs;
    }

    lines.push(VITALS_START);
    if (tension) lines.push(`Tension: ${tension.trim()}`);
    if (temperature) lines.push(`Temperature: ${temperature.trim()}`);
    if (poids) lines.push(`Poids: ${poids.trim()}`);
    if (taille) lines.push(`Taille: ${taille.trim()}`);
    if (pouls) lines.push(`Pouls: ${pouls.trim()}`);
    lines.push(VITALS_END);

    if (obs) {
        return `${lines.join('\n')}\n\n${obs}`;
    }
    return lines.join('\n');
}

/**
 * Décode les constantes vitales et sépare les observations libres
 */
function unpackVitals(rawText) {
    const result = {
        tension: '',
        temperature: '',
        poids: '',
        taille: '',
        pouls: '',
        cleanObservations: rawText || ''
    };

    if (!rawText || typeof rawText !== 'string') {
        return result;
    }

    const startIndex = rawText.indexOf(VITALS_START);
    const endIndex = rawText.indexOf(VITALS_END);

    if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
        const vitalsBlock = rawText.substring(startIndex + VITALS_START.length, endIndex);
        const lines = vitalsBlock.split('\n');

        lines.forEach(line => {
            const trimmed = line.trim();
            if (trimmed.startsWith('Tension:')) {
                result.tension = trimmed.replace('Tension:', '').trim();
            } else if (trimmed.startsWith('Temperature:')) {
                result.temperature = trimmed.replace('Temperature:', '').trim();
            } else if (trimmed.startsWith('Poids:')) {
                result.poids = trimmed.replace('Poids:', '').trim();
            } else if (trimmed.startsWith('Taille:')) {
                result.taille = trimmed.replace('Taille:', '').trim();
            } else if (trimmed.startsWith('Pouls:')) {
                result.pouls = trimmed.replace('Pouls:', '').trim();
            }
        });

        // Nettoyer les observations
        const before = rawText.substring(0, startIndex).trim();
        const after = rawText.substring(endIndex + VITALS_END.length).trim();
        result.cleanObservations = [before, after].filter(Boolean).join('\n\n');
    }

    return result;
}

module.exports = {
    packVitals,
    unpackVitals
};
