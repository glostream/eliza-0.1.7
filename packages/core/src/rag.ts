import { getLastNMessages } from "./customUtils";
import elizaLogger from "./logger";
import { IAgentRuntime } from "./types";

/**
 * Gets an embedding vector for text using the Voyage AI API
 * @param runtime - The agent runtime instance
 * @param recentMessages - Text to generate embeddings for
 * @returns Embedding response from Voyage AI API
 */
export async function getEmbedding(
    runtime: IAgentRuntime,
    recentMessages: string
) {
    const embedding = await runtime
        .fetch("https://api.voyageai.com/v1/embeddings", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
            },
            body: JSON.stringify({
                model: "voyage-3",
                input: [recentMessages],
                input_type: "query",
            }),
        })
        .then((res) => res.json());

    return embedding;
}

/**
 * Searches for similar documents in Qdrant vector database using an embedding
 * @param runtime - The agent runtime instance
 * @param embedding - Embedding vector to search with
 * @returns Search response from Qdrant API containing similar documents
 */
export async function searchSimilar(runtime: IAgentRuntime, embedding: any) {
    elizaLogger.info("Searching for similar documents...");
    const embedding_sample = JSON.parse(JSON.stringify(embedding));
    embedding_sample.data[0].embedding =
        embedding_sample.data[0].embedding.slice(0, 10);
    elizaLogger.info("Embedding sample:", embedding_sample);
    elizaLogger.info(
        "Qdrant URL:",
        `${process.env.QDRANT_URL.slice(0, 14)}...`
    );
    elizaLogger.info(
        "Qdrant API Key:",
        `${process.env.QDRANT_API_KEY.slice(0, 6)}...`
    );
    const search_response = await runtime
        .fetch(`${process.env.QDRANT_URL}/collections/rag/points/search`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "api-key": process.env.QDRANT_API_KEY,
            },
            body: JSON.stringify({
                vector: embedding.data[0].embedding,
                limit: runtime.character.numRagDocuments || 10, // Get top 10 most similar documents
                with_payload: true,
                score_threshold: 0.5,
            }),
        })
        .then((res) => res.json());

    return search_response;
}

/**
 * Reranks search results using Voyage AI's reranking model
 * @param runtime - The agent runtime instance
 * @param recentMessages - Original query text
 * @param search_response - Search results from Qdrant to rerank
 * @returns Reranking response from Voyage AI API with reordered results
 */
export async function rerankResults(
    runtime: IAgentRuntime,
    recentMessages: string,
    search_response: any
) {
    const rerank_response = await runtime
        .fetch("https://api.voyageai.com/v1/rerank", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
            },
            body: JSON.stringify({
                query: recentMessages,
                documents: search_response.result.map(
                    (result: any) => result.payload.text
                ),
                model: "rerank-2",
                top_k: runtime.character.numRerankedDocuments || 3,
            }),
        })
        .then((res) => res.json());

    // Sort the search results based on reranking scores
    const rerankIndices = rerank_response.data.map((doc: any) => doc.index);

    const rerankedResults = rerankIndices.map(
        (index: number) => search_response.result[index]
    );

    return rerankedResults;
}

export async function rag(
    runtime: IAgentRuntime,
    context: string
): Promise<string> {
    // RAG
    // Extract last few messages
    const recentMessages = getLastNMessages(
        context,
        runtime.character.numRecentMessages || 3
    );

    elizaLogger.info("Recent messages:", recentMessages);

    const embedding = await getEmbedding(runtime, recentMessages);

    const search_response = await searchSimilar(runtime, embedding);

    elizaLogger.info("Search response:", search_response);

    let contextWithRag = context;

    if (search_response.result.length > 0) {
        elizaLogger.info("Reranking results...");
        const rerankedResults = await rerankResults(
            runtime,
            recentMessages,
            search_response
        );
        elizaLogger.info("Rerank response:", rerankedResults);

        contextWithRag = `${context}\n\n# Relevant Sources: ${rerankedResults.map(
            (result: any, sourceIdx: number) =>
                `\n${sourceIdx + 1}. Source:\n${result.payload.text}\n\nSource metadata:\n${result?.payload?.metadata}`
        )}`;
    }

    elizaLogger.info("Context with RAG:", contextWithRag);
    return contextWithRag;
}
