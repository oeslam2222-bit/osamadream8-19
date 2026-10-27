import {
  USER_TABLE_COLUMNS,
  pickUserColumns,
  sanitizeSupervisorId
} from '../src/services/userRowPayload';

const fail: string[] = [];
const check = (name: string, condition: boolean, detail = '') => {
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${name}${detail ? `: ${detail}` : ''}`);
  if (!condition) fail.push(name);
};

const fullPayload = {
  id: 'u-1',
  name: 'أحمد',
  full_name: 'أحمد',
  username: 'ahmed',
  email: 'ahmed@dream.com',
  password: 'hash',
  role: 'sales_rep',
  branch_name: 'الفرع الرئيسي',
  supervisor_id: 'u-sup',
  phone: '01000000000',
  commission_rate: 2.5,
  is_active: true,
  approval_status: 'active',
  created_at: '2026-01-01T00:00:00.000Z'
};

// 1) app_users: ممنوع يتبعت له supervisor_id أو commission_rate (كان سبب 400)
const appUsersPayload = pickUserColumns('app_users', fullPayload);
check('app_users drops supervisor_id', !('supervisor_id' in appUsersPayload));
check('app_users drops commission_rate', !('commission_rate' in appUsersPayload));
check('app_users keeps name', appUsersPayload.name === 'أحمد');
check(
  'app_users columns match database',
  Object.keys(appUsersPayload).sort().join(',') ===
    ['id', 'name', 'username', 'email', 'password', 'role', 'branch_name', 'phone', 'is_active', 'approval_status', 'created_at']
      .sort()
      .join(',')
);

// 2) profiles: بيستخدم full_name وممنوع supervisor_id (كان سبب 409 مع القيد الفريد)
const profilePayload = pickUserColumns('profiles', fullPayload);
check('profiles drops supervisor_id', !('supervisor_id' in profilePayload));
check('profiles keeps full_name', profilePayload.full_name === 'أحمد');
check('profiles has no name column', !('name' in profilePayload));

// 3) users: الجدول الأساسي لازم يحتفظ بكل الأعمدة
const usersPayload = pickUserColumns('users', fullPayload);
check('users keeps supervisor_id', usersPayload.supervisor_id === 'u-sup');
check('users keeps commission_rate', usersPayload.commission_rate === 2.5);

// 4) تنظيف المشرف الميت
const known = new Set(['u-sup', 'u-2']);
check(
  'keeps valid supervisor',
  sanitizeSupervisorId({ supervisor_id: 'u-sup' }, known).supervisor_id === 'u-sup'
);
check(
  'nulls unknown supervisor',
  sanitizeSupervisorId({ supervisor_id: 'u-missing' }, known).supervisor_id === null
);
check(
  'keeps supervisor when no user list loaded',
  sanitizeSupervisorId({ supervisor_id: 'u-x' }, new Set()).supervisor_id === 'u-x'
);
check(
  'allows clearing supervisor on purpose',
  sanitizeSupervisorId({ supervisor_id: null }, known).supervisor_id === null
);

// 5) القوائم نفسها مطابقة للمخطط اللي اتأكدنا منه من PostgREST
check('users column list', USER_TABLE_COLUMNS.users.includes('supervisor_id'));
check('app_users column list', USER_TABLE_COLUMNS.app_users.length === 11);
check('profiles column list', USER_TABLE_COLUMNS.profiles.includes('full_name'));

if (fail.length > 0) {
  console.error(`\n${fail.length} check(s) failed: ${fail.join(', ')}`);
  process.exit(1);
}
console.log('\nAll user payload checks passed.');
