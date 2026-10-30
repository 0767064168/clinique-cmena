require('dotenv').config();
const bcrypt = require('bcryptjs');
const { supabaseAdmin, createAuthClient } = require('../config/supabase');

const USERS_TO_CREATE = [
    {
        email: 'reception@gspm.ci',
        password: 'Password123!',
        nom: 'KONE',
        prenom: 'Aminata',
        role: 'receptionniste'
    },
    {
        email: 'comptable@gspm.ci',
        password: 'Password123!',
        nom: 'DIABATE',
        prenom: 'Seydou',
        role: 'comptable'
    },
    {
        email: 'pharmacie@gspm.ci',
        password: 'Password123!',
        nom: 'TOURE',
        prenom: 'Drissa',
        role: 'pharmacien'
    }
];

async function main() {
    console.log('--- Initialisation des rôles et comptes utilisateurs ---');

    for (const u of USERS_TO_CREATE) {
        console.log(`\nTraitement pour ${u.email} (${u.role})...`);

        // 1. Vérifier si l'utilisateur existe déjà dans auth
        const { data: listData } = await supabaseAdmin.auth.admin.listUsers();
        let existingUser = (listData && listData.users ? listData.users : []).find(x => x.email === u.email);

        let userId = existingUser ? existingUser.id : null;

        if (!userId) {
            console.log(`Création dans Supabase Auth de ${u.email}...`);
            const { data: authUser, error: authErr } = await supabaseAdmin.auth.admin.createUser({
                email: u.email,
                password: u.password,
                email_confirm: true,
                user_metadata: { nom: u.nom, prenom: u.prenom, role: u.role }
            });

            if (authErr) {
                console.error(`Erreur création auth ${u.email}:`, authErr.message);
                continue;
            }
            userId = authUser.user.id;
            console.log(`Compte Auth créé avec succès (ID: ${userId})`);
        } else {
            console.log(`Utilisateur Auth existant trouvé (ID: ${userId}), mise à jour du mot de passe...`);
            await supabaseAdmin.auth.admin.updateUserById(userId, {
                password: u.password,
                email_confirm: true,
                user_metadata: { nom: u.nom, prenom: u.prenom, role: u.role }
            });
        }

        // 2. Hash du mot de passe pour la table utilisateurs
        const hashedPassword = await bcrypt.hash(u.password, 10);

        // 3. Upsert dans la table utilisateurs
        const { error: userErr } = await supabaseAdmin
            .from('utilisateurs')
            .upsert([{
                id: userId,
                nom: u.nom,
                prenom: u.prenom,
                email: u.email,
                mot_de_passe: hashedPassword,
                role: u.role,
                actif: true,
                updated_at: new Date()
            }]);

        if (userErr) {
            console.error(`Erreur insertion table utilisateurs pour ${u.email}:`, userErr.message);
        } else {
            console.log(`Table utilisateurs synchronisée avec succès pour ${u.nom} ${u.prenom} (${u.role})`);
        }

        // 4. Test d'authentification
        const authClient = createAuthClient();
        const { data: loginData, error: loginErr } = await authClient.auth.signInWithPassword({
            email: u.email,
            password: u.password
        });

        if (loginErr) {
            console.error(`Échec test connexion pour ${u.email}:`, loginErr.message);
        } else {
            console.log(`Test de connexion réussi pour ${u.email}`);
            await authClient.auth.signOut();
        }
    }

    console.log('\n--- Tous les rôles ont été configurés avec succès ---');
}

main().catch(err => {
    console.error('Erreur globale:', err);
    process.exit(1);
});
