import elizaLogger from "./logger";

/**
 * Gets the last n messages from a conversation history string
 * @param conversationHistory String containing timestamped messages
 * @param n Number of messages to return
 * @returns String containing the last n messages
 */
export function getLastNMessages(
    conversationHistory: string,
    n: number
): string {
    elizaLogger.info("Keeping last n messages:", n);
    // Pattern matches timestamp at start of each message:
    // e.g. "(26 minutes ago) [3c716]"
    const pattern = "\\(just now|\\d+.*?\\sago\\)\\s\\[[a-z0-9]+\\]";

    // Split on the timestamp pattern, but keep the delimiters
    const messages = conversationHistory
        .trim()
        .split(new RegExp(`(?=${pattern})`));

    elizaLogger.info("Total number of messages:", messages.length);

    // Filter out empty strings and trim whitespace
    const cleanMessages = messages
        .map((msg) => msg.trim())
        .filter((msg) => msg.length > 0);

    // Take only the last n messages
    const lastN =
        // 1 is subtracted since the most recent message is a special case that is not counted
        n <= cleanMessages.length ? cleanMessages.slice(-n) : cleanMessages;

    // Join them back together with newlines
    return lastN.join("\n");
}

/**
 * Sorts search results based on reranking scores
 * @param rerank_response - Reranking response from Voyage AI API
 * @param search_response - Search results from Qdrant API
 * @returns Sorted search results
 */
export function sortRerankedResults(
    rerank_response: any,
    search_response: any
) {
    // Sort the search results based on reranking scores
    const rerankIndices = rerank_response.data.map((doc: any) => doc.index);
    elizaLogger.info("Rerank indices:", rerankIndices);

    const rerankedResults = rerankIndices.map(
        (index: number) => search_response.result[index]
    );

    return rerankedResults;
}
