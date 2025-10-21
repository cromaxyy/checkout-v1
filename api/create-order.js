// api/create-order.js
// Função serverless — roda no backend da Vercel.
// Usa as variáveis PAGARME_SK_TEST e PAGARME_PK_TEST configuradas no painel.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  const { method, buyer, bumps, total } = req.body;
  const secret = process.env.PAGARME_SK_TEST;

  if (!secret) {
    return res.status(500).json({ error: "Chave secreta não configurada" });
  }

  // 🔹 Monta os itens da compra
  const items = [
    {
      amount: Math.round(37 * 100),
      description: "Produto 1",
      quantity: 1,
      code: "produto1",
    },
  ];

  // 🔹 Adiciona order bumps
  if (Array.isArray(bumps)) {
    bumps.forEach((b) => {
      items.push({
        amount: Math.round(parseFloat(b.value) * 100),
        description: `Orderbump ${b.id}`,
        quantity: 1,
        code: `ob${b.id}`,
      });
    });
  }

  // 🔹 Payload base para criar order na Pagar.me
  const order = {
    items,
    customer: {
      name: buyer.nome,
      email: buyer.email,
      document: buyer.cpf,
      type: "individual",
    },
    payments: [
      method === "pix"
        ? {
            payment_method: "pix",
            pix: {
              expires_in: 3600, // expira em 1h
            },
          }
        : {
            payment_method: "credit_card",
            credit_card: {
              operation_type: "auth_and_capture",
              installments: 1,
              card: {
                number: "4000000000000010",
                holder_name: buyer.nome,
                exp_month: 12,
                exp_year: 2030,
                cvv: "123",
              },
            },
          },
    ],
  };

  try {
    const response = await fetch("https://api.pagar.me/core/v5/orders", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${secret}:`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(order),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error("Erro Pagar.me:", data);
      return res.status(400).json(data);
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error("Erro inesperado:", err);
    return res.status(500).json({ error: "Erro ao criar pedido" });
  }
}

