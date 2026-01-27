const prisma = require('./db'); // On utilise votre Singleton Prisma
const bcrypt = require('bcryptjs');

async function createAdmin() {
  const hashedPassword = await bcrypt.hash('VOTRE_MOT_DE_PASSE_SUR', 10);
  
  try {
    const admin = await prisma.user.upsert({
      where: { email: 'admin@ongere.com' },
      update: {},
      create: {
        name: 'Super Admin',
        email: 'admin@ongere.com',
        password: hashedPassword,
        role: 'ADMIN',
        plan: 'GOLD',
        isVerified: true
      },
    });
    console.log('✅ Admin créé avec succès :', admin.email);
  } catch (error) {
    console.error('❌ Erreur :', error);
  } finally {
    await prisma.$disconnect();
  }
}

createAdmin();