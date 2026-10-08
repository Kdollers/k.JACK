"""HTTP-level behaviour through api.dispatch: authentication, company policy, isolation, translation."""

import io
import unittest
from unittest import mock

from genesis import api, catalog, company
from genesis.errors import PermissionDenied
from genesis.i18n import translate
from genesis.locales import TRANSLATIONS
from tests.helpers import ADMIN_PASSWORD, Env


def call(env, method, path, body=None, query=None, token=None, lang=None):
    return api.dispatch(env.app, method, path, body=body, query=query, token=token or "", lang=lang)


def login(env, username="admin", password=ADMIN_PASSWORD):
    status, payload = call(env, "POST", "/api/login",
                           body={"company": env.slug, "username": username, "password": password})
    assert status == 200, payload
    return payload["token"]


class RoutingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.env = Env()

    @classmethod
    def tearDownClass(cls):
        cls.env.close()

    def test_public_endpoints_need_no_token(self):
        self.assertEqual(call(self.env, "GET", "/api/health")[0], 200)
        status, payload = call(self.env, "GET", "/api/i18n/fr")
        self.assertEqual(status, 200)
        self.assertEqual(set(payload["dictionary"]), set(TRANSLATIONS["en"]))

    def test_protected_endpoint_without_token_is_401(self):
        status, payload = call(self.env, "GET", "/api/me")
        self.assertEqual(status, 401)
        self.assertEqual(payload["error"], "authentication_required")

    def test_unknown_token_is_401(self):
        status, payload = call(self.env, "GET", "/api/me", token="not-a-real-token")
        self.assertEqual(status, 401)
        self.assertEqual(payload["error"], "session_expired")

    def test_me_and_logout_work_through_the_request_token(self):
        token = login(self.env)
        status, payload = call(self.env, "GET", "/api/me", token=token)
        self.assertEqual(status, 200)
        self.assertEqual(payload["user"]["username"], "admin")
        self.assertEqual(call(self.env, "POST", "/api/logout", token=token)[0], 200)
        self.assertEqual(call(self.env, "GET", "/api/me", token=token)[0], 401)

    def test_unknown_route_is_404_and_wrong_method_is_405(self):
        self.assertEqual(call(self.env, "GET", "/api/nope")[0], 404)
        self.assertEqual(call(self.env, "DELETE", "/api/health")[0], 405)

    def test_unexpected_error_is_500_without_leaking_details(self):
        token = login(self.env)
        with mock.patch.object(company, "company_profile", side_effect=RuntimeError("secret detail")), \
                mock.patch("sys.stderr", new_callable=io.StringIO):
            status, payload = call(self.env, "GET", "/api/me", token=token)
        self.assertEqual(status, 500)
        self.assertEqual(payload["error"], "internal_error")
        self.assertNotIn("secret detail", str(payload))

    def test_error_message_follows_requested_language(self):
        status, payload = call(self.env, "GET", "/api/me", lang="fr")
        self.assertEqual(payload["message"], translate("authentication_required", "fr"))
        self.assertNotEqual(payload["message"], translate("authentication_required", "en"))


class CompanyPolicyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.env = Env()
        with cls.env.db.transaction():
            company.create_user(cls.env.ctx, {"username": "seller", "full_name": "Seller",
                                              "role": "sales", "password": "Seller-pass-1"})
        cls.seller = login(cls.env, "seller", "Seller-pass-1")
        cls.admin = login(cls.env)

    @classmethod
    def tearDownClass(cls):
        cls.env.close()

    def test_company_list_requires_an_administrator(self):
        self.assertEqual(call(self.env, "GET", "/api/companies")[0], 401)
        self.assertEqual(call(self.env, "GET", "/api/companies", token=self.seller)[0], 403)
        status, payload = call(self.env, "GET", "/api/companies", token=self.admin)
        self.assertEqual(status, 200)
        self.assertIn(self.env.slug, [row["slug"] for row in payload])

    def test_creating_a_company_after_setup_needs_an_administrator(self):
        body = {"name": "Second Co", "currency_code": "RWF", "admin_username": "boss",
                "admin_full_name": "Boss", "admin_password": "Boss-pass-123"}
        self.assertEqual(call(self.env, "POST", "/api/companies", body=body)[0], 401)
        self.assertEqual(call(self.env, "POST", "/api/companies", body=body, token=self.seller)[0], 403)

    def test_anonymous_company_creation_error_is_translated(self):
        status, payload = call(self.env, "POST", "/api/companies", body={"name": "X"}, lang="rw")
        self.assertEqual(status, 401)
        self.assertEqual(payload["message"], translate("authentication_required", "rw"))

    def test_company_creation_in_kinyarwanda_translates_chart_and_warehouse(self):
        body = {"name": "Ikigo Kinyarwanda", "currency_code": "RWF", "admin_username": "umuyobozi",
                "admin_full_name": "Umuyobozi", "admin_password": "Umuyobozi-123",
                "default_language": "rw", "country_profile": "RW"}
        status, payload = call(self.env, "POST", "/api/companies", body=body, token=self.admin)
        self.assertEqual(status, 200, payload)
        new_slug = payload["slug"]
        token, _user = self.env.app.login(new_slug, "umuyobozi", "Umuyobozi-123")
        ctx = self.env.app.context_for(token)
        cash = ctx.db.one("SELECT name FROM accounts WHERE system_role = 'cash'")
        self.assertEqual(cash["name"], translate("coa_cash_on_hand", "rw"))
        self.assertNotEqual(cash["name"], translate("coa_cash_on_hand", "en"))
        warehouse = ctx.db.one("SELECT name FROM warehouses WHERE code = 'MAIN'")
        self.assertEqual(warehouse["name"], translate("wh_main", "rw"))

    def test_company_creation_validation_error_is_in_french(self):
        status, payload = call(self.env, "POST", "/api/companies",
                               body={"name": "", "currency_code": "RWF"}, token=self.admin, lang="fr")
        self.assertEqual(status, 422)
        self.assertNotIn("required", payload["message"].lower())
        self.assertIn(payload["error"], TRANSLATIONS["en"])


class IsolationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.first = Env()
        cls.second_slug = cls.first.app.create_company(
            name="Other Company", currency_code="RWF", admin_username="admin",
            admin_full_name="Other Admin", admin_password=ADMIN_PASSWORD,
            country_profile="RW")["slug"]

    @classmethod
    def tearDownClass(cls):
        cls.first.close()

    def test_customers_never_cross_companies(self):
        token_a = login(self.first)
        status, _ = call(self.first, "POST", "/api/customers", body={"name": "Only In First"}, token=token_a)
        self.assertEqual(status, 200)
        status, payload = call(self.first, "POST", "/api/login",
                               body={"company": self.second_slug, "username": "admin",
                                     "password": ADMIN_PASSWORD})
        self.assertEqual(status, 200)
        token_b = payload["token"]
        listed_b = call(self.first, "GET", "/api/customers", token=token_b)[1]
        self.assertNotIn("Only In First", [row["name"] for row in listed_b])
        listed_a = call(self.first, "GET", "/api/customers", token=token_a)[1]
        self.assertIn("Only In First", [row["name"] for row in listed_a])

    def test_token_is_bound_to_its_company(self):
        token_a = login(self.first)
        ctx = self.first.app.context_for(token_a)
        self.assertEqual(ctx.company_slug, self.first.slug)
        self.assertNotEqual(ctx.company_slug, self.second_slug)


class BackupDirectoryPolicyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.env = Env()

    @classmethod
    def tearDownClass(cls):
        cls.env.close()

    def test_backup_dir_needs_backup_manage_not_just_settings(self):
        ctx = self.env.ctx
        ctx.permissions = frozenset(ctx.permissions - {"backup.manage"})
        with self.assertRaises(PermissionDenied):
            company.update_company_profile(ctx, {"backup_dir": "/tmp/genesis-x"})
        ctx.permissions = frozenset(ctx.permissions | {"backup.manage"})
        company.update_company_profile(ctx, {"backup_dir": "/tmp/genesis-ok"})
        self.assertEqual(company.get_setting(self.env.db, "backup_dir"), "/tmp/genesis-ok")

    def test_backup_dir_must_be_absolute_and_cannot_traverse(self):
        status, payload = call(self.env, "PUT", "/api/settings", body={"backup_dir": "relative/dir"},
                               token=login(self.env))
        self.assertEqual((status, payload["error"]), (422, "backup_dir_must_be_absolute"))
        status, payload = call(self.env, "PUT", "/api/settings", body={"backup_dir": "/tmp/a/../../etc"},
                               token=login(self.env))
        self.assertEqual((status, payload["error"]), (422, "backup_dir_invalid"))


class CatalogPartnerSmoke(unittest.TestCase):
    """Customers and suppliers created through the API get separate, sequential codes."""

    @classmethod
    def setUpClass(cls):
        cls.env = Env()

    @classmethod
    def tearDownClass(cls):
        cls.env.close()

    def test_partner_codes_are_assigned_and_unique(self):
        first = catalog.save_partner(self.env.ctx, "customer", {"name": "Alpha"})
        second = catalog.save_partner(self.env.ctx, "customer", {"name": "Beta"})
        self.assertNotEqual(first["code"], second["code"])
        self.assertTrue(first["code"])


if __name__ == "__main__":
    unittest.main()
