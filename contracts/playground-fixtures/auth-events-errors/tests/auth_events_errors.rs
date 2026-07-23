use soroban_sdk::{
    testutils::{Address as _, Events as _, MockAuth, MockAuthInvoke},
    Address, Env, Event, IntoVal,
};
use velo_playground_auth_events_errors::{
    ActionAuthorized, AuthEventsErrorsFixture, AuthEventsErrorsFixtureClient, AuthFixtureError,
};

#[test]
fn authorized_action_requires_the_actor_and_emits_an_event() {
    let env = Env::default();
    let contract_id = env.register(AuthEventsErrorsFixture, ());
    let client = AuthEventsErrorsFixtureClient::new(&env, &contract_id);
    let actor = Address::generate(&env);
    let amount = 25u32;

    let result = client
        .mock_auths(&[MockAuth {
            address: &actor,
            invoke: &MockAuthInvoke {
                contract: &contract_id,
                fn_name: "authorize",
                args: (&actor, &amount).into_val(&env),
                sub_invokes: &[],
            },
        }])
        .authorize(&actor, &amount);

    assert_eq!(result, amount);
    assert_eq!(env.auths().len(), 1);
    assert_eq!(
        env.events().all(),
        std::vec![ActionAuthorized { actor, amount }.to_xdr(&env, &contract_id)]
    );
}

#[test]
fn wrong_authorizer_cannot_approve_the_action() {
    let env = Env::default();
    let contract_id = env.register(AuthEventsErrorsFixture, ());
    let client = AuthEventsErrorsFixtureClient::new(&env, &contract_id);
    let actor = Address::generate(&env);
    let wrong_actor = Address::generate(&env);
    let amount = 25u32;

    let result = client
        .mock_auths(&[MockAuth {
            address: &wrong_actor,
            invoke: &MockAuthInvoke {
                contract: &contract_id,
                fn_name: "authorize",
                args: (&actor, &amount).into_val(&env),
                sub_invokes: &[],
            },
        }])
        .try_authorize(&actor, &amount);

    assert!(result.is_err());
    assert_eq!(env.events().all(), std::vec![]);
}

#[test]
fn contract_errors_are_stable_and_distinct() {
    let env = Env::default();
    let contract_id = env.register(AuthEventsErrorsFixture, ());
    let client = AuthEventsErrorsFixtureClient::new(&env, &contract_id);
    let actor = Address::generate(&env);

    assert_eq!(
        client.try_authorize(&actor, &0).unwrap_err().unwrap(),
        AuthFixtureError::InvalidAmount
    );
    assert_eq!(
        client.try_always_fail().unwrap_err().unwrap(),
        AuthFixtureError::DeliberateFailure
    );
}
