import { useMutation, useQueryClient } from "@tanstack/react-query";
export function useAction<T, V>(
  projectId: string,
  action: (variables: V) => Promise<T>,
  success?: (data: T) => void,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: action,
    onSuccess: async (data) => {
      await client.invalidateQueries({ queryKey: ["workspace", projectId] });
      success?.(data);
    },
  });
}
