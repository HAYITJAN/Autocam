import { useUsers } from "@/api/queries";
import { Badge, Card, PageHeader, QueryView } from "@/components/ui";
import { t } from "@/lib/i18n";

export default function UsersPage() {
  const users = useUsers(true);
  return (
    <>
      <PageHeader title={t("nav.users")} subtitle="Tizim foydalanuvchilari va ularning rollari" />
      <Card>
        <QueryView query={users} isEmpty={(items) => items.length === 0}>
          {(items) => (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-line">
                <thead className="bg-soft">
                  <tr>
                    <th className="th">{t("users.fullName")}</th>
                    <th className="th">{t("users.username")}</th>
                    <th className="th">Email</th>
                    <th className="th">{t("users.role")}</th>
                    <th className="th">{t("violation.status")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {items.map((user) => (
                    <tr key={user.id} className="hover:bg-soft">
                      <td className="td font-medium">{user.full_name}</td>
                      <td className="td font-mono text-xs">{user.username}</td>
                      <td className="td">{user.email}</td>
                      <td className="td">
                        <Badge tone="violet">{user.role_name}</Badge>
                      </td>
                      <td className="td">
                        <Badge tone={user.status === "ACTIVE" ? "green" : user.status === "BLOCKED" ? "red" : "slate"}>
                          {t(`users.status.${user.status}`)}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </QueryView>
      </Card>
    </>
  );
}
