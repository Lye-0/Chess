export type EmployeeProfile = {
  id: string;
  name: string;
  email: string;
  employmentType: string;
  organization: string;
  department: string;
};

export const employees: EmployeeProfile[] = [
  {
    id: "tanaka-kenichi",
    name: "田中健一",
    email: "tanaka@example.com",
    employmentType: "正社員",
    organization: "名古屋エンジニアリング",
    department: "開発部",
  },
  {
    id: "ito-yumi",
    name: "伊藤由美",
    email: "ito@example.com",
    employmentType: "パート",
    organization: "名古屋エンジニアリング",
    department: "開発部",
  },
];

export const currentEmployee = employees[0];
