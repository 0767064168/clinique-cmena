/**
 * ==============================================================================
 * Clinique Médico-Chirurgicale NANAN (CMENA) - Script Principal JavaScript
 * ==============================================================================
 * Fichier : public/js/main.js
 * Rôle : Utilitaires front-end vanilla JS, gestion dynamique de facturation,
 * conversion de nombres en lettres françaises, recherche, validations et UI.
 */

'use strict';

(function (window, document) {

  // ============================================================================
  // 1. FORMATAGE DES NOMBRES ET DEVISES (FRANÇAIS / FCFA)
  // ============================================================================

  /**
   * Formate un nombre avec séparateurs d'espaces (format français).
   * Exemples :
   *   formatNumber(50075) => "50 075"
   *   formatNumber(1250000.5, 2) => "1 250 000,50"
   *
   * @param {number|string} num - Le nombre à formater
   * @param {number} [decimals=0] - Nombre de décimales (par défaut 0 pour le FCFA)
   * @returns {string} Le nombre formaté avec des espaces
   */
  function formatNumber(num, decimals = 0) {
    if (num === null || num === undefined || num === '' || isNaN(Number(num))) {
      return '0';
    }

    const n = Number(num);
    const parts = n.toFixed(decimals).split('.');
    let integerPart = parts[0];
    const decimalPart = parts[1];

    // Insertion d'un espace tous les 3 chiffres
    integerPart = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

    if (decimals > 0 && decimalPart !== undefined) {
      return `${integerPart},${decimalPart}`;
    }

    return integerPart;
  }

  /**
   * Formate un montant en Francs CFA (FCFA).
   * Exemple : formatCurrency(50000) => "50 000 FCFA"
   *
   * @param {number|string} amount - Montant en FCFA
   * @returns {string} Montant formaté suivi du symbole FCFA
   */
  function formatCurrency(amount) {
    return `${formatNumber(amount, 0)} FCFA`;
  }

  /**
   * Convertit un montant en FCFA vers l'équivalent en Euros (EUR).
   * Taux officiel de parité fixe UEMOA : 1 EUR = 655,957 FCFA
   *
   * @param {number|string} amountFcfa - Montant en FCFA
   * @returns {string} Montant formaté en Euros (ex: "76,22 €")
   */
  function convertFcfaToEur(amountFcfa) {
    if (!amountFcfa || isNaN(Number(amountFcfa))) return '0,00 €';
    const eur = Number(amountFcfa) / 655.957;
    return `${formatNumber(eur, 2)} €`;
  }

  // ============================================================================
  // 2. CONVERSION DE NOMBRE EN LETTRES (FRANÇAIS)
  // ============================================================================

  /**
   * Convertit un nombre entier en toutes lettres selon la grammaire française.
   * Exemple : numberToFrenchWords(50075) => "CINQUANTE MILLE SOIXANTE-QUINZE"
   *
   * @param {number|string} num - Nombre à convertir (entre 0 et 999 999 999 999)
   * @returns {string} Nombre en lettres majuscules
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

    // Conversion d'un nombre de 0 à 99
    function convertDizaines(val) {
      if (val < 20) {
        return UNITES[val];
      }

      const d = Math.floor(val / 10);
      const u = val % 10;

      // 70 à 79 (Soixante-dix...)
      if (d === 7) {
        if (u === 1) return 'SOIXANTE-ET-ONZE';
        return `SOIXANTE-${UNITES[10 + u]}`;
      }

      // 80 à 89 (Quatre-vingts...)
      if (d === 8) {
        if (u === 0) return 'QUATRE-VINGTS';
        return `QUATRE-VINGT-${UNITES[u]}`;
      }

      // 90 à 99 (Quatre-vingt-dix...)
      if (d === 9) {
        return `QUATRE-VINGT-${UNITES[10 + u]}`;
      }

      // 20 à 69
      const base = DIZAINES[d];
      if (u === 1) {
        return `${base}-ET-UN`;
      } else if (u > 1) {
        return `${base}-${UNITES[u]}`;
      }
      return base;
    }

    // Conversion d'un bloc de 3 chiffres (0 à 999)
    function convertCentaines(val) {
      if (val === 0) return '';

      const c = Math.floor(val / 100);
      const reste = val % 100;
      let res = '';

      if (c === 1) {
        res = 'CENT';
      } else if (c > 1) {
        res = `${UNITES[c]} CENT${reste === 0 ? 'S' : ''}`;
      }

      if (reste > 0) {
        const dizaineStr = convertDizaines(reste);
        res = res ? `${res} ${dizaineStr}` : dizaineStr;
      }

      return res;
    }

    // Décomposition en milliards, millions, milliers, unités
    const milliards = Math.floor(n / 1000000000);
    const millions = Math.floor((n % 1000000000) / 1000000);
    const mille = Math.floor((n % 1000000) / 1000);
    const reste = n % 1000;

    const parties = [];

    // Milliards
    if (milliards > 0) {
      if (milliards === 1) {
        parties.push('UN MILLIARD');
      } else {
        parties.push(`${convertCentaines(milliards)} MILLIARDS`);
      }
    }

    // Millions
    if (millions > 0) {
      if (millions === 1) {
        parties.push('UN MILLION');
      } else {
        parties.push(`${convertCentaines(millions)} MILLIONS`);
      }
    }

    // Milliers
    if (mille > 0) {
      if (mille === 1) {
        parties.push('MILLE'); // En français : "mille", jamais "un mille"
      } else {
        parties.push(`${convertCentaines(mille)} MILLE`); // "mille" est invariable
      }
    }

    // Unités / Centaines
    if (reste > 0) {
      parties.push(convertCentaines(reste));
    }

    return parties.join(' ').trim();
  }

  /**
   * Convertit un montant en toutes lettres avec devise FCFA.
   * Exemple : amountToWords(50075) => "CINQUANTE MILLE SOIXANTE-QUINZE FRANCS CFA"
   *
   * @param {number|string} amount
   * @param {string} [devise='FRANCS CFA']
   * @returns {string}
   */
  function amountToWords(amount, devise = 'FRANCS CFA') {
    const words = numberToFrenchWords(amount);
    return `${words} ${devise}`.trim();
  }

  // ============================================================================
  // 3. GESTION DYNAMIQUE DES LIGNES DE FACTURATION
  // ============================================================================

  /**
   * Obtient le conteneur du tableau des lignes de facturation.
   * @returns {HTMLElement|null}
   */
  function getInvoiceTableBody() {
    return document.getElementById('invoice-lines-body') ||
           document.getElementById('lignes-facture-body') ||
           document.querySelector('[data-invoice-lines-body]') ||
           document.querySelector('#invoice-table tbody');
  }

  /**
   * Ajoute une nouvelle ligne d'article/acte à la table des factures.
   *
   * @param {Object} [data={}] Données pré-remplies optionnelles
   * @returns {HTMLTableRowElement|null} La ligne ajoutée
   */
  function addInvoiceLine(data = {}) {
    const tbody = getInvoiceTableBody();
    if (!tbody) {
      console.warn('[CMENA] Conteneur des lignes de facture introuvable.');
      return null;
    }

    const rows = tbody.querySelectorAll('tr.invoice-line-row');
    const index = rows.length;

    const designation = data.designation || '';
    const quantite = data.quantite !== undefined ? data.quantite : 1;
    const prixUnitaire = data.prix_unitaire !== undefined ? data.prix_unitaire : 0;
    const tauxPriseEnCharge = data.taux_prise_en_charge !== undefined ? data.taux_prise_en_charge : 100;

    const row = document.createElement('tr');
    row.className = 'invoice-line-row border-b border-gray-200 hover:bg-teal-50/40 transition-colors';
    row.dataset.lineIndex = index;

    row.innerHTML = `
      <td class="py-3 px-3">
        <input type="text"
               name="lignes[${index}][designation]"
               value="${escapeHtml(designation)}"
               placeholder="Description de l'acte ou prestation..."
               class="line-designation w-full rounded-md border-gray-300 shadow-sm text-sm focus:border-teal-500 focus:ring-teal-500"
               required>
      </td>
      <td class="py-3 px-3 w-28">
        <input type="number"
               name="lignes[${index}][quantite]"
               value="${quantite}"
               min="1"
               step="1"
               class="line-quantite w-full rounded-md border-gray-300 shadow-sm text-sm text-center focus:border-teal-500 focus:ring-teal-500"
               required>
      </td>
      <td class="py-3 px-3 w-36">
        <input type="number"
               name="lignes[${index}][prix_unitaire]"
               value="${prixUnitaire}"
               min="0"
               step="50"
               placeholder="0"
               class="line-pu w-full rounded-md border-gray-300 shadow-sm text-sm text-right focus:border-teal-500 focus:ring-teal-500"
               required>
      </td>
      <td class="py-3 px-3 w-28">
        <div class="relative rounded-md shadow-sm">
          <input type="number"
                 name="lignes[${index}][taux_pec]"
                 value="${tauxPriseEnCharge}"
                 min="0"
                 max="100"
                 step="5"
                 class="line-taux w-full rounded-md border-gray-300 text-sm text-center pr-6 focus:border-teal-500 focus:ring-teal-500">
          <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
            <span class="text-xs text-gray-500">%</span>
          </div>
        </div>
      </td>
      <td class="py-3 px-3 w-36 text-right font-medium text-gray-900">
        <span class="line-total-display text-sm font-semibold">0 FCFA</span>
        <input type="hidden" name="lignes[${index}][montant_total]" class="line-total-input" value="0">
      </td>
      <td class="py-3 px-2 w-16 text-center no-print">
        <button type="button"
                class="btn-remove-line text-red-500 hover:text-red-700 p-1.5 rounded-full hover:bg-red-50 transition-colors"
                title="Supprimer cette ligne">
          <i class="fas fa-trash-alt text-sm"></i>
        </button>
      </td>
    `;

    tbody.appendChild(row);

    // Attacher l'événement de suppression
    const removeBtn = row.querySelector('.btn-remove-line');
    if (removeBtn) {
      removeBtn.addEventListener('click', function () {
        removeInvoiceLine(row);
      });
    }

    // Calculer le montant de la nouvelle ligne et le total global
    calculateLineTotal(row);
    calculateInvoiceTotal();

    return row;
  }

  /**
   * Supprime une ligne de facturation.
   *
   * @param {HTMLTableRowElement|number|string} target - Élément TR ou index de la ligne
   */
  function removeInvoiceLine(target) {
    let row = null;
    const tbody = getInvoiceTableBody();
    if (!tbody) return;

    if (typeof target === 'number' || (typeof target === 'string' && !isNaN(Number(target)))) {
      const rows = tbody.querySelectorAll('tr.invoice-line-row');
      row = rows[Number(target)];
    } else if (target instanceof HTMLElement) {
      row = target.closest('tr.invoice-line-row') || target;
    }

    if (row && row.parentNode) {
      row.remove();
      reindexInvoiceLines();
      calculateInvoiceTotal();
    }
  }

  /**
   * Réindexe les attributs name des inputs après suppression d'une ligne.
   */
  function reindexInvoiceLines() {
    const tbody = getInvoiceTableBody();
    if (!tbody) return;

    const rows = tbody.querySelectorAll('tr.invoice-line-row');
    rows.forEach((row, newIndex) => {
      row.dataset.lineIndex = newIndex;

      const inputs = row.querySelectorAll('input, select, textarea');
      inputs.forEach(input => {
        const name = input.getAttribute('name');
        if (name) {
          input.setAttribute('name', name.replace(/lignes\[\d+\]/, `lignes[${newIndex}]`));
        }
      });
    });
  }

  /**
   * Calcule le montant total pour une ligne spécifique : (PU × Qté × Taux / 100).
   *
   * @param {HTMLTableRowElement|number} target - Ligne de tableau ou son index
   * @returns {number} Montant calculé pour la ligne en FCFA
   */
  function calculateLineTotal(target) {
    let row = null;
    const tbody = getInvoiceTableBody();

    if (typeof target === 'number' && tbody) {
      row = tbody.querySelectorAll('tr.invoice-line-row')[target];
    } else if (target instanceof HTMLElement) {
      row = target.closest('tr.invoice-line-row') || target;
    }

    if (!row) return 0;

    const qteInput = row.querySelector('.line-quantite');
    const puInput = row.querySelector('.line-pu');
    const tauxInput = row.querySelector('.line-taux');
    const displaySpan = row.querySelector('.line-total-display');
    const totalInput = row.querySelector('.line-total-input');

    const qte = parseFloat(qteInput ? qteInput.value : 1) || 0;
    const pu = parseFloat(puInput ? puInput.value : 0) || 0;
    // Si le champ taux existe, on l'utilise, sinon taux par défaut = 100%
    const taux = tauxInput ? (parseFloat(tauxInput.value) || 0) : 100;

    // Formule : PU × Qté × % / 100
    const total = Math.round(pu * qte * (taux / 100));

    if (displaySpan) {
      displaySpan.textContent = formatCurrency(total);
    }
    if (totalInput) {
      totalInput.value = total;
    }

    return total;
  }

  /**
   * Calcule le total général de la facture :
   * - Somme de toutes les lignes
   * - Application de la remise (pourcentage ou montant fixe)
   * - Calcul de la conversion en EUR
   * - Mise à jour du montant en toutes lettres
   */
  function calculateInvoiceTotal() {
    const tbody = getInvoiceTableBody();
    let totalBrut = 0;

    if (tbody) {
      const rows = tbody.querySelectorAll('tr.invoice-line-row');
      rows.forEach(row => {
        totalBrut += calculateLineTotal(row);
      });
    }

    // Remise éventuelle
    const remiseInput = document.getElementById('facture-remise') ||
                        document.querySelector('[name="remise"]');
    const typeRemiseSelect = document.getElementById('facture-type-remise') ||
                             document.querySelector('[name="type_remise"]');

    let montantRemise = 0;
    if (remiseInput) {
      const valRemise = parseFloat(remiseInput.value) || 0;
      const type = typeRemiseSelect ? typeRemiseSelect.value : 'fixe';

      if (type === 'pourcent' || type === '%') {
        montantRemise = Math.round(totalBrut * (valRemise / 100));
      } else {
        montantRemise = valRemise;
      }
    }

    const totalNet = Math.max(0, totalBrut - montantRemise);

    // Prise en charge / Part patient éventuelle
    const partPatientInput = document.getElementById('facture-part-patient');
    const partAssuranceInput = document.getElementById('facture-part-assurance');

    // Mise à jour des affichages
    updateTextOrValue('total-brut-display', formatCurrency(totalBrut));
    updateTextOrValue('total-brut-input', totalBrut);

    updateTextOrValue('remise-display', formatCurrency(montantRemise));

    updateTextOrValue('total-net-display', formatCurrency(totalNet));
    updateTextOrValue('total-net-input', totalNet);

    // Équivalent Euro
    const montantEur = convertFcfaToEur(totalNet);
    updateTextOrValue('total-eur-display', montantEur);

    // Montant en toutes lettres
    const montantLettres = numberToFrenchWords(totalNet);
    updateTextOrValue('montant-lettres-display', `${montantLettres} FRANCS CFA`);
    updateTextOrValue('montant-lettres-input', `${montantLettres} FRANCS CFA`);

    return {
      totalBrut,
      montantRemise,
      totalNet,
      montantEur,
      montantLettres
    };
  }

  /**
   * Met à jour soit un champ input (value), soit un conteneur texte (textContent).
   * @param {string} id
   * @param {string|number} value
   */
  function updateTextOrValue(id, value) {
    const el = document.getElementById(id);
    if (!el) return;

    if ('value' in el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
      el.value = value;
    } else {
      el.textContent = value;
    }
  }

  // ============================================================================
  // 4. DIALOGUE DE CONFIRMATION DE SUPPRESSION
  // ============================================================================

  /**
   * Affiche une boîte de confirmation personnalisée avant suppression.
   *
   * @param {string} [message] - Message explicatif pour l'utilisateur
   * @returns {boolean} - true si l'utilisateur confirme
   */
  function confirmDelete(message) {
    const defaultMsg = 'Êtes-vous sûr de vouloir supprimer cet élément ? Cette action est irréversible.';
    return window.confirm(message || defaultMsg);
  }

  // ============================================================================
  // 5. FONCTIONS DE RECHERCHE ET ANTI-REBOND (DEBOUNCE)
  // ============================================================================

  /**
   * Crée une fonction retardée (anti-rebond) pour éviter des requêtes excessives.
   *
   * @param {Function} func - Fonction à exécuter
   * @param {number} [wait=300] - Temps d'attente en millisecondes
   * @returns {Function}
   */
  function debounce(func, wait = 300) {
    let timeoutId;
    return function (...args) {
      const context = this;
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        func.apply(context, args);
      }, wait);
    };
  }

  /**
   * Filtre en temps réel les lignes d'un tableau HTML.
   *
   * @param {string|HTMLInputElement} searchInput - Input de recherche
   * @param {string|HTMLTableElement} tableTarget - Tableau ou sélecteur du tableau
   */
  function setupTableSearch(searchInput, tableTarget) {
    const input = typeof searchInput === 'string' ? document.querySelector(searchInput) : searchInput;
    const table = typeof tableTarget === 'string' ? document.querySelector(tableTarget) : tableTarget;

    if (!input || !table) return;

    const handler = debounce(function () {
      const query = input.value.trim().toLowerCase();
      const rows = table.querySelectorAll('tbody tr:not(.empty-state-row)');

      rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        if (text.includes(query)) {
          row.style.display = '';
        } else {
          row.style.display = 'none';
        }
      });
    }, 250);

    input.addEventListener('input', handler);
  }

  // ============================================================================
  // 6. GESTION DES MESSAGES FLASH (AUTO-DISMISS APRÈS 5 SECONDES)
  // ============================================================================

  /**
   * Initialise la fermeture automatique des alertes et messages flash.
   * Disparaît en fondu après 5000ms.
   */
  function initFlashMessages() {
    const flashMessages = document.querySelectorAll(
      '.flash-message, [data-flash-message], .alert-auto-dismiss, ' +
      '.bg-green-50.border-l-4, .bg-red-50.border-l-4'
    );

    flashMessages.forEach(msg => {
      // Bouton de fermeture manuelle si non présent
      if (!msg.querySelector('.btn-close-flash')) {
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'btn-close-flash ml-auto text-gray-400 hover:text-gray-600 focus:outline-none p-1';
        closeBtn.innerHTML = '<i class="fas fa-times text-xs"></i>';
        closeBtn.setAttribute('aria-label', 'Fermer');

        closeBtn.addEventListener('click', () => {
          dismissFlash(msg);
        });

        // Trouver le conteneur flex parent dans l'alerte
        const flexContainer = msg.querySelector('.flex') || msg;
        flexContainer.appendChild(closeBtn);
      }

      // Fermeture automatique programmée à 5 secondes
      setTimeout(() => {
        dismissFlash(msg);
      }, 5000);
    });
  }

  /**
   * Fait disparaître un message flash avec une transition fluide.
   * @param {HTMLElement} element
   */
  function dismissFlash(element) {
    if (!element || !element.parentNode) return;

    element.style.transition = 'opacity 0.4s ease, transform 0.4s ease, max-height 0.4s ease';
    element.style.opacity = '0';
    element.style.transform = 'translateY(-6px)';

    setTimeout(() => {
      if (element.parentNode) {
        element.parentNode.removeChild(element);
      }
    }, 400);
  }

  // ============================================================================
  // 7. BASCULE DU MENU LATÉRAL SUR MOBILE (SIDEBAR TOGGLE)
  // ============================================================================

  /**
   * Gère l'ouverture et la fermeture du menu latéral sur mobile.
   */
  function initSidebar() {
    const toggleButtons = document.querySelectorAll(
      '#mobile-menu-button, [data-sidebar-toggle], button[\\@click*="sidebarOpen"]'
    );
    const sidebar = document.getElementById('sidebar') || document.querySelector('aside');
    const overlay = document.getElementById('sidebar-overlay');
    const closeButtons = document.querySelectorAll('[data-sidebar-close]');

    function openSidebar() {
      if (sidebar) sidebar.classList.remove('-translate-x-full');
      if (overlay) overlay.classList.remove('hidden');
      document.body.classList.add('overflow-hidden');
    }

    function closeSidebar() {
      if (sidebar) sidebar.classList.add('-translate-x-full');
      if (overlay) overlay.classList.add('hidden');
      document.body.classList.remove('overflow-hidden');
    }

    toggleButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        // Si Alpine.js ne gère pas déjà l'élément
        if (!window.Alpine) {
          e.preventDefault();
          openSidebar();
        }
      });
    });

    closeButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        if (!window.Alpine) {
          e.preventDefault();
          closeSidebar();
        }
      });
    });

    if (overlay) {
      overlay.addEventListener('click', closeSidebar);
    }
  }

  // ============================================================================
  // 8. SÉLECTEUR ET RECHERCHE DE PATIENT (PATIENT SELECT)
  // ============================================================================

  /**
   * Configure un sélecteur de patient avec recherche dynamique.
   *
   * @param {string|HTMLSelectElement|HTMLInputElement} targetElement
   * @param {Object} [options={}]
   */
  function setupPatientSelect(targetElement, options = {}) {
    const element = typeof targetElement === 'string'
      ? document.querySelector(targetElement)
      : targetElement;

    if (!element) return;

    // Si c'est un input texte avec autocomplétion
    if (element.tagName === 'INPUT') {
      const resultsContainer = document.getElementById(options.resultsId || 'patient-search-results');
      if (!resultsContainer) return;

      const handleSearch = debounce(async function () {
        const query = element.value.trim();
        if (query.length < 2) {
          resultsContainer.classList.add('hidden');
          resultsContainer.innerHTML = '';
          return;
        }

        try {
          const endpoint = options.endpoint || `/patients/search?q=${encodeURIComponent(query)}`;
          const response = await fetch(endpoint);
          if (!response.ok) return;

          const patients = await response.json();
          renderPatientResults(patients, resultsContainer, options.onSelect);
        } catch (err) {
          console.error('[CMENA] Erreur lors de la recherche patient:', err);
        }
      }, 300);

      element.addEventListener('input', handleSearch);

      // Cacher les résultats en cliquant en dehors
      document.addEventListener('click', (e) => {
        if (!element.contains(e.target) && !resultsContainer.contains(e.target)) {
          resultsContainer.classList.add('hidden');
        }
      });
    }

    // Si c'est un select standard à filtrer
    if (element.tagName === 'SELECT' && options.searchInput) {
      const filterInput = typeof options.searchInput === 'string'
        ? document.querySelector(options.searchInput)
        : options.searchInput;

      if (filterInput) {
        filterInput.addEventListener('input', debounce(function () {
          const term = filterInput.value.toLowerCase();
          Array.from(element.options).forEach(opt => {
            if (!opt.value) return; // Garder l'option par défaut
            const matches = opt.textContent.toLowerCase().includes(term);
            opt.style.display = matches ? '' : 'none';
          });
        }, 200));
      }
    }
  }

  /**
   * Rend les résultats de la recherche patient dans le conteneur flottant.
   *
   * @param {Array} patients
   * @param {HTMLElement} container
   * @param {Function} [onSelect]
   */
  function renderPatientResults(patients, container, onSelect) {
    container.innerHTML = '';

    if (!patients || patients.length === 0) {
      container.innerHTML = `
        <div class="p-3 text-sm text-gray-500 text-center">
          Aucun patient trouvé.
        </div>
      `;
      container.classList.remove('hidden');
      return;
    }

    const ul = document.createElement('ul');
    ul.className = 'max-h-60 overflow-y-auto divide-y divide-gray-100';

    patients.forEach(patient => {
      const li = document.createElement('li');
      li.className = 'p-3 hover:bg-teal-50 cursor-pointer transition-colors flex items-center justify-between text-sm';
      li.innerHTML = `
        <div>
          <span class="font-semibold text-gray-900">${escapeHtml(patient.nom)} ${escapeHtml(patient.prenom || '')}</span>
          <span class="text-xs text-gray-500 ml-2">Matricule: ${escapeHtml(patient.matricule || patient.code || 'N/A')}</span>
          <div class="text-xs text-gray-400 mt-0.5">
            <i class="fas fa-phone-alt mr-1"></i>${escapeHtml(patient.telephone || 'Non renseigné')}
          </div>
        </div>
        <span class="text-xs bg-teal-100 text-teal-800 font-medium px-2 py-0.5 rounded-full">
          Choisir
        </span>
      `;

      li.addEventListener('click', () => {
        container.classList.add('hidden');
        if (typeof onSelect === 'function') {
          onSelect(patient);
        } else {
          // Remplissage par défaut des champs conventionnels
          const idInput = document.getElementById('patient_id') || document.querySelector('[name="patient_id"]');
          const nameInput = document.getElementById('patient_nom') || document.querySelector('[name="patient_nom"]');
          if (idInput) idInput.value = patient.id;
          if (nameInput) nameInput.value = `${patient.nom} ${patient.prenom || ''}`.trim();
        }
      });

      ul.appendChild(li);
    });

    container.appendChild(ul);
    container.classList.remove('hidden');
  }

  // ============================================================================
  // 9. UTILITAIRES DE DATE ET ÂGE
  // ============================================================================

  /**
   * Formate une date au format français (ex: "08/10/2026").
   *
   * @param {string|Date} dateVal - Date ISO ou objet Date
   * @param {string} [format='DD/MM/YYYY'] - Format cible
   * @returns {string}
   */
  function formatDate(dateVal, format = 'DD/MM/YYYY') {
    if (!dateVal) return '';

    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return '';

    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');

    if (format === 'DD/MM/YYYY HH:mm') {
      return `${day}/${month}/${year} à ${hours}:${minutes}`;
    }

    if (format === 'YYYY-MM-DD') {
      return `${year}-${month}-${day}`;
    }

    if (format === 'long') {
      const options = { year: 'numeric', month: 'long', day: 'numeric' };
      return d.toLocaleDateString('fr-FR', options);
    }

    return `${day}/${month}/${year}`;
  }

  /**
   * Calcule l'âge en années à partir d'une date de naissance.
   *
   * @param {string|Date} birthDate
   * @returns {number|null} Âge révolu ou null si date invalide
   */
  function calculateAge(birthDate) {
    if (!birthDate) return null;
    const birth = new Date(birthDate);
    if (isNaN(birth.getTime())) return null;

    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();

    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
      age--;
    }

    return Math.max(0, age);
  }

  /**
   * Renvoie la date du jour au format input standard (YYYY-MM-DD).
   * @returns {string}
   */
  function getTodayDateString() {
    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const year = today.getFullYear();
    return `${year}-${month}-${day}`;
  }

  // ============================================================================
  // 10. VALIDATIONS DE FORMULAIRE (VALIDATEURS CÔTE D'IVOIRE & MÉDICAUX)
  // ============================================================================

  /**
   * Vérifie la validité d'un numéro de téléphone en Côte d'Ivoire.
   * Depuis février 2021, la numérotation compte 10 chiffres (indicatif +225 optionnel).
   * Formats valides : 01XXXXXXXX, 05XXXXXXXX, 07XXXXXXXX, ou +225 01XXXXXXXX.
   *
   * @param {string} phone
   * @returns {boolean}
   */
  function validatePhoneCI(phone) {
    if (!phone) return false;
    // Nettoyer les espaces, tirets et parenthèses
    const clean = phone.replace(/[\s\-\(\)\.]/g, '');
    // Format local 10 chiffres (commençant par 01, 05, 07, 21, 25, 27)
    const localRegex = /^(01|05|07|21|25|27)\d{8}$/;
    // Format international (+225 ou 00225 suivi de 10 chiffres)
    const intlRegex = /^(\+225|00225)(01|05|07|21|25|27)\d{8}$/;

    return localRegex.test(clean) || intlRegex.test(clean);
  }

  /**
   * Valide une adresse email standard.
   * @param {string} email
   * @returns {boolean}
   */
  function validateEmail(email) {
    if (!email) return false;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim());
  }

  /**
   * Valide les champs obligatoires d'un formulaire et applique des styles d'erreur.
   *
   * @param {HTMLFormElement} form
   * @returns {boolean} true si le formulaire est valide
   */
  function validateForm(form) {
    if (!form) return true;

    let isValid = true;
    const requiredInputs = form.querySelectorAll('[required]');

    requiredInputs.forEach(input => {
      const val = input.value.trim();
      let inputValid = true;

      if (!val) {
        inputValid = false;
      } else if (input.type === 'email' && !validateEmail(val)) {
        inputValid = false;
      } else if (input.classList.contains('input-phone-ci') && !validatePhoneCI(val)) {
        inputValid = false;
      }

      if (!inputValid) {
        isValid = false;
        input.classList.add('border-red-500', 'focus:ring-red-500');
        input.classList.remove('border-gray-300', 'focus:ring-teal-500');
      } else {
        input.classList.remove('border-red-500', 'focus:ring-red-500');
        input.classList.add('border-gray-300');
      }
    });

    return isValid;
  }

  // ============================================================================
  // 11. UTILITAIRES INTERNES
  // ============================================================================

  /**
   * Échappe les caractères HTML dangereux pour éviter les injections XSS.
   * @param {string} str
   * @returns {string}
   */
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // ============================================================================
  // 12. INITIALISATION GLOBALE DU DOM AU CHARGEMENT
  // ============================================================================

  function initApp() {
    // 1. Initialiser la disparition automatique des alertes flash
    initFlashMessages();

    // 2. Initialiser la bascule du menu latéral mobile
    initSidebar();

    // 3. Délégation globale pour les confirmations de suppression
    document.addEventListener('click', function (e) {
      const target = e.target.closest('[data-confirm], .btn-delete, form.form-delete button[type="submit"]');
      if (target) {
        const msg = target.getAttribute('data-confirm') ||
                    target.dataset.confirm ||
                    'Êtes-vous sûr de vouloir supprimer cet élément ?';
        if (!confirmDelete(msg)) {
          e.preventDefault();
          e.stopPropagation();
        }
      }
    });

    // 4. Délégation automatique pour le recalcul des lignes de factures
    const invoiceTable = document.getElementById('invoice-lines-table') ||
                         document.getElementById('lignes-facture-table') ||
                         document.querySelector('[data-invoice-table]');

    if (invoiceTable) {
      invoiceTable.addEventListener('input', function (e) {
        const target = e.target;
        if (target.matches('.line-quantite, .line-pu, .line-taux')) {
          const row = target.closest('tr.invoice-line-row');
          if (row) {
            calculateLineTotal(row);
            calculateInvoiceTotal();
          }
        }
      });

      // Recalcul sur remise ou type de remise
      const remiseInputs = document.querySelectorAll('#facture-remise, #facture-type-remise, [name="remise"], [name="type_remise"]');
      remiseInputs.forEach(el => {
        el.addEventListener('input', calculateInvoiceTotal);
        el.addEventListener('change', calculateInvoiceTotal);
      });

      // Bouton d'ajout de ligne
      const addLineBtn = document.getElementById('btn-add-line') ||
                         document.querySelector('[data-action="add-line"]');
      if (addLineBtn) {
        addLineBtn.addEventListener('click', function (e) {
          e.preventDefault();
          addInvoiceLine();
        });
      }

      // Calcul initial si des lignes existent déjà
      calculateInvoiceTotal();
    }

    // 5. Recherche globale dans l'en-tête
    const headerSearch = document.getElementById('search');
    if (headerSearch) {
      headerSearch.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          const q = headerSearch.value.trim();
          if (q) {
            window.location.href = `/patients?search=${encodeURIComponent(q)}`;
          }
        }
      });
    }

    // 6. Remplissage automatique de la date du jour sur les champs prévus
    const todayInputs = document.querySelectorAll('input[type="date"][data-default-today]');
    todayInputs.forEach(input => {
      if (!input.value) {
        input.value = getTodayDateString();
      }
    });
  }

  // Lancer l'initialisation dès que le DOM est prêt
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }

  // ============================================================================
  // 13. EXPORT GLOBAL POUR UTILISATION EN LIGNE (EJS & ALPINE.JS)
  // ============================================================================

  // Attacher les fonctions principales à l'objet global window
  window.formatNumber = formatNumber;
  window.formatCurrency = formatCurrency;
  window.convertFcfaToEur = convertFcfaToEur;
  window.numberToFrenchWords = numberToFrenchWords;
  window.amountToWords = amountToWords;
  window.addInvoiceLine = addInvoiceLine;
  window.removeInvoiceLine = removeInvoiceLine;
  window.calculateLineTotal = calculateLineTotal;
  window.calculateInvoiceTotal = calculateInvoiceTotal;
  window.confirmDelete = confirmDelete;
  window.debounce = debounce;
  window.setupTableSearch = setupTableSearch;
  window.setupPatientSelect = setupPatientSelect;
  window.formatDate = formatDate;
  window.calculateAge = calculateAge;
  window.validatePhoneCI = validatePhoneCI;
  window.validateEmail = validateEmail;
  window.validateForm = validateForm;

  // Espace de nommage CMENA complet
  window.CMENA = {
    formatNumber,
    formatCurrency,
    convertFcfaToEur,
    numberToFrenchWords,
    amountToWords,
    addInvoiceLine,
    removeInvoiceLine,
    calculateLineTotal,
    calculateInvoiceTotal,
    confirmDelete,
    debounce,
    setupTableSearch,
    setupPatientSelect,
    formatDate,
    calculateAge,
    validatePhoneCI,
    validateEmail,
    validateForm,
    initFlashMessages,
    initSidebar
  };

})(window, document);
