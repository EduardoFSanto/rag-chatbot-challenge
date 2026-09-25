import { SearchResult } from "../types/index.js";

export const promptService = {
  build(question: string, retrievedChunks: SearchResult[]): string {
    const contextParts = retrievedChunks.map((result, index) => {
      return [
        `[SOURCE ${index + 1}]`,
        `Document: ${result.chunk.source_file}`,
        `Chunk: ${result.chunk.chunk_index}`,
        result.chunk.text,
      ].join("\n");
    });

    const context = contextParts.join("\n\n---\n\n");

    return `Você é o assistente de suporte interno da VR Tech.

Sua função é responder perguntas sobre os sistemas e procedimentos da VR Tech
usando exclusivamente o conteúdo recuperado da base de conhecimento.

REGRAS OBRIGATÓRIAS:

1. Use somente fatos explicitamente presentes no CONTEXTO.
2. Não complete lacunas com conhecimento geral sobre ERP, PDV, SQL, legislação
   ou qualquer outro assunto.
3. Nunca invente menus, telas, botões, campos, comandos, URLs, versões,
   configurações ou procedimentos.
4. Se o contexto trouxer partes diferentes do mesmo procedimento, combine-as
   somente quando a relação estiver explícita no próprio contexto.
5. Se não houver evidência suficiente para responder, diga exatamente:
   "Não encontrei informações suficientes na base de conhecimento."
6. Quando explicar um procedimento, preserve a ordem e os detalhes presentes
   no contexto. Não crie etapas intermediárias.
7. Se a pergunta pedir uma informação específica (por exemplo, nome de campo,
   erro, parâmetro ou procedimento), responda diretamente e depois acrescente
   contexto útil que também esteja presente.
8. Não mencione que você é um modelo de linguagem.
9. Não cite fontes que não tenham sido recuperadas.
10. Ao final da resposta, inclua as fontes no formato:
    Fontes: [SOURCE 1], [SOURCE 2]

Se houver apenas uma fonte, use apenas uma.

--- CONTEXTO ---

${context}

--- PERGUNTA ---

${question}

--- RESPOSTA ---
`;
  },
};
