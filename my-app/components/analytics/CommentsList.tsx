import { Employee, Assignment } from "@/types/global";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface CommentsListProps {
  employees: Employee[];
  assignments: Assignment[];
}

export function CommentsList({ employees, assignments }: CommentsListProps) {
  const comments = assignments
    .filter((a) => a.comment)
    .map((a) => {
      const employee = employees.find((e) => e._id === a.employeeId);
      return {
        ...a,
        employeeName: employee?.name || "Unknown",
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  if (comments.length === 0) {
    return <p className="text-muted-foreground">No comments this month.</p>;
  }

  return (
    <div className="space-y-4">
      {comments.map((c) => (
        <Card key={c._id}>
          <CardHeader className="py-3">
            <CardTitle className="text-sm font-medium">
              {c.employeeName} – {c.date}
            </CardTitle>
          </CardHeader>
          <CardContent className="py-2 text-sm">
            <p>{c.comment}</p>
            {c.amount ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Amount: {c.amount} AMD
              </p>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}