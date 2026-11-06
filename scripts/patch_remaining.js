const fs = require('fs');

// 1. Fix server.js - Add inventaires import
let server = fs.readFileSync('server.js', 'utf8');

// Add import line after rechercheRoutes
server = server.replace(
  /const rechercheRoutes = require\('\.\/routes\/recherche'\);/,
  `const rechercheRoutes = require('./routes/recherche');\nconst inventairesRoutes = require('./routes/inventaires');`
);

fs.writeFileSync('server.js', server, 'utf8');
console.log('✅ server.js: inventaires import added');

// 2. Fix pharmacie/index.ejs - Add Inventaires button
let pharma = fs.readFileSync('views/pharmacie/index.ejs', 'utf8');

const oldBtn = `<a href="/pharmacie/create" class="inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold py-2 px-4 rounded-lg shadow-sm text-xs sm:text-sm transition">`;

const newBtn = `<a href="/pharmacie/inventaires" class="inline-flex items-center justify-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 font-semibold py-2 px-3 rounded-lg text-xs transition border border-indigo-300" title="Inventaire physique de la pharmacie">
                <i class="fas fa-clipboard-check text-indigo-600"></i>
                <span>Inventaires</span>
            </a>
            <a href="/pharmacie/create" class="inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold py-2 px-4 rounded-lg shadow-sm text-xs sm:text-sm transition">`;

pharma = pharma.replace(oldBtn, newBtn);

fs.writeFileSync('views/pharmacie/index.ejs', pharma, 'utf8');
console.log('✅ pharmacie/index.ejs: Inventaires button added');
