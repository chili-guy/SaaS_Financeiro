import Stripe from 'stripe';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.join(__dirname, '.env') });

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

async function createLink() {
  try {
    const link = await stripe.paymentLinks.create({
      line_items: [
        {
          price: process.env.STRIPE_PRICE_ID,
          quantity: 1,
        },
      ],
      after_completion: {
        type: 'redirect',
        redirect: {
          url: `${process.env.APP_URL}/success.html`,
        },
      },
      phone_number_collection: {
        enabled: true,
      },
      // Ativa o trial de 30 dias na estrutura de assinatura
      subscription_data: {
        trial_period_days: 30,
      },
    });

    console.log('\n✅ Link de Checkout (Payment Link) gerado com sucesso!\n');
    console.log('Use este link no botão da sua Landing Page:');
    console.log('👉 ' + link.url + '\n');
    console.log('🔔 Nota: Este link coleta o telefone do usuário obrigatoriamente para o Nico ativar o acesso.');
  } catch (error) {
    console.error('❌ Erro ao gerar link:', error.message);
  }
}

createLink();
