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

    if (!method || !["pix", "card", "credit_card"].includes(method)) {
      return res.status(400).json({ error: "Forma de pagamento inválida" });
    }
    if (!buyer?.nome || !buyer?.email || !buyer?.cpf) {
      return res.status(400).json({ error: "Dados do comprador incompletos" });
    }

    const cpf = String(buyer.cpf).replace(/\D/g, "").slice(0, 11);
    if (cpf.length !== 11) {
      return res.status(400).json({ error: "CPF inválido" });
    }

    const items = [
      { amount: 3700, description: "Produto 1", quantity: 1, code: "produto1" },
    ];

    bumps.forEach((b) => {
      if (b && b.value) {
        items.push({
          amount: Math.round(parseFloat(b.value) * 100),
          description: `Orderbump ${b.id}`,
          quantity: 1,
          code: `ob${b.id}`,
        });
      }
    });

    const totalAmount = items.reduce((acc, item) => acc + item.amount, 0);

    const basePayload = {
      items,
      customer: {
        name: buyer.nome,
        email: buyer.email,
        document: cpf,
        type: "individual",
        phones: {
          mobile_phone: {
            country_code: "55",
            area_code: "11",
            number: "999999999"
          }
        }
      },
    };

    const payments =
      method === "pix"
        ? [
            {
              payment_method: "pix",
              amount: totalAmount,
              capture: true,
              pix: {
                expires_in: 3600,
                additional_information: [
                  { name: "Produto", value: "Produto 1" },
                  { name: "Email", value: buyer.email },
                ],
              },
            },
          ]
        : [
            {
              payment_method: "credit_card",
              amount: totalAmount,
              capture: true,
              billing: {
                address: {
                  line_1: "Rua Exemplo, 123",
                  zip_code: "01311000",
                  city: "São Paulo",
                  state: "SP",
                  country: "BR"
                }
              },
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
          ];

    const orderPayload = { ...basePayload, payments };

    const r = await fetch("https://api.pagar.me/core/v5/orders", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${secret}:`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(orderPayload),
    });

    const data = await r.json();

    if (!r.ok) {
      console.error("Erro Pagar.me:", data);
      return res.status(r.status).json({
        error: data?.message || "Erro ao criar pedido",
        details: data,
      });
    }

    const charge = data?.charges?.[0];
    const tx = charge?.last_transaction;

    if (charge?.status === "failed" || tx?.status === "failed") {
      return res.status(200).json({
        error: "Transação falhou",
        status: charge?.status || tx?.status,
        reason:
          tx?.acquirer_message ||
          tx?.status_reason ||
          tx?.gateway_response_message ||
          "Motivo desconhecido",
        data,
      });
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error("Erro inesperado:", err);
    return res.status(500).json({ error: "Erro ao criar pedido" });
  }
}
