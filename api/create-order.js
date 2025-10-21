// api/create-order.js
// Rota serverless (Vercel). NÃO expõe suas chaves.
// Requer as envs: PAGARME_SK_TEST (obrigatória) e PAGARME_PK_TEST (opcional)

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  const secret = process.env.PAGARME_SK_TEST;
  if (!secret) {
    return res.status(500).json({ error: "PAGARME_SK_TEST não configurada" });
  }

  try {
    const { method, buyer, bumps = [] } = req.body || {};

    // --------- Validações mínimas ---------
    if (!method || !["pix", "card", "credit_card"].includes(method)) {
      return res.status(400).json({ error: "Forma de pagamento inválida" });
    }
    if (!buyer?.nome || !buyer?.email || !buyer?.cpf) {
      return res.status(400).json({ error: "Dados do comprador incompletos" });
    }

    // Sanitiza CPF (remove tudo que não for número) e limita a 11 dígitos
    const cpf = String(buyer.cpf).replace(/\D/g, "").slice(0, 11);
    if (cpf.length !== 11) {
      return res.status(400).json({
        error: "CPF inválido",
        hint: "Para sandbox, use 12345678909 (somente números).",
        field: "customer.document",
      });
    }

    // --------- Itens (em centavos) ---------
    const items = [
      {
        amount: Math.round(37 * 100), // Produto 1
        description: "Produto 1",
        quantity: 1,
        code: "produto1",
      },
    ];

    bumps
      .filter(b => b && b.value)
      .forEach(b => {
        items.push({
          amount: Math.round(parseFloat(b.value) * 100),
          description: `Orderbump ${b.id}`,
          quantity: 1,
          code: `ob${b.id}`,
        });
      });

    // --------- Payload da Order (Pagar.me v5) ---------
    const orderPayload = {
      items,
      customer: {
        name: buyer.nome,
        email: buyer.email,
        document: cpf,
        type: "individual",
      },
      payments: [
        method === "pix" || method === "PIX"
          ? {
              payment_method: "pix",
              pix: { expires_in: 3600 }, // 1h
            }
          : {
              payment_method: "credit_card",
              credit_card: {
                operation_type: "auth_and_capture",
                installments: 1,
                // Para sandbox: usamos um cartão de teste fixo no backend.
                // Em produção, você vai tokenizar o card no front com a pk.
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

    // --------- Chamada à API ---------
    const r = await fetch("https://api.pagar.me/core/v5/orders", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${secret}:`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(orderPayload),
    });

    const data = await r.json();

    // Encaminha erro com mais clareza pro front
    if (!r.ok) {
      return res.status(r.status).json({
        error: data?.message || "Erro na Pagar.me",
        errors: data?.errors || null,
      });
    }

    // Sucesso
    return res.status(200).json(data);
  } catch (err) {
    console.error("Erro inesperado:", err);
    return res.status(500).json({ error: "Erro ao criar pedido" });
  }
}
