/**
 * Utilitaires pour l'application CSA 3e Compagnie GSPM Bouaké
 */

function numberToFrenchWords(num) {
    const n = Math.floor(Math.abs(Number(num) || 0));
    if (n === 0) return 'ZÉRO';

    const UNITES = [
        '', 'UN', 'DEUX', 'TROIS', 'QUATRE', 'CINQ', 'SIX', 'SEPT', 'HUIT', 'NEUF',
        'DIX', 'ONZE', 'DOUZE', 'TREIZE', 'QUATORZE', 'QUINZE', 'SEIZE', 'DIX-SEPT',
        'DIX-HUIT', 'DIX-NEUF'
    ];

    const DIZAINES = [
        '', 'DIX', 'VINGT', 'TRENTE', 'QUARANTE', 'CINQUANTE', 'SOIXANTE',
        'SOIXANTE-DIX', 'QUATRE-VINGTS', 'QUATRE-VINGT-DIX'
    ];

    function convertDizaines(val) {
        if (val < 20) return UNITES[val];
        const d = Math.floor(val / 10);
        const u = val % 10;
        if (d === 7) {
            if (u === 1) return 'SOIXANTE-ET-ONZE';
            return `SOIXANTE-${UNITES[10 + u]}`;
        }
        if (d === 8) {
            if (u === 0) return 'QUATRE-VINGTS';
            return `QUATRE-VINGT-${UNITES[u]}`;
        }
        if (d === 9) {
            return `QUATRE-VINGT-${UNITES[10 + u]}`;
        }
        const base = DIZAINES[d];
        if (u === 1) return `${base}-ET-UN`;
        if (u > 1) return `${base}-${UNITES[u]}`;
        return base;
    }

    function convertCentaines(val) {
        if (val === 0) return '';
        const c = Math.floor(val / 100);
        const reste = val % 100;
        let prefix = '';
        if (c === 1) {
            prefix = 'CENT';
        } else if (c > 1) {
            prefix = `${UNITES[c]} CENT${reste === 0 ? 'S' : ''}`;
        }
        const suite = convertDizaines(reste);
        if (prefix && suite) return `${prefix} ${suite}`;
        return prefix || suite;
    }

    const millions = Math.floor(n / 1000000);
    const milliers = Math.floor((n % 1000000) / 1000);
    const unites = n % 1000;

    const parts = [];

    if (millions > 0) {
        if (millions === 1) {
            parts.push('UN MILLION');
        } else {
            parts.push(`${convertCentaines(millions)} MILLIONS`);
        }
    }

    if (milliers > 0) {
        if (milliers === 1) {
            parts.push('MILLE');
        } else {
            parts.push(`${convertCentaines(milliers)} MILLE`);
        }
    }

    if (unites > 0) {
        parts.push(convertCentaines(unites));
    }

    return parts.join(' ').trim();
}

module.exports = {
    numberToFrenchWords
};
