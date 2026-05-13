export function findAiCandidateNames({ diagnostics = [], statistics = {} }) {
  return {
    unknownCardNames: statistics.unknownCardNames || [],
    diagnosticsToExplain: diagnostics
      .filter((item) => item.severity !== "info")
      .slice(0, 8)
      .map((item) => ({ code: item.code, message: item.message }))
  };
}
