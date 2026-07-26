use soroban_sdk::{symbol_short, Env, Symbol};
use velo_playground_hello::{HelloFixture, HelloFixtureClient};

#[test]
fn hello_returns_the_browser_qualification_value() {
    let env = Env::default();
    let contract_id = env.register(HelloFixture, ());
    let client = HelloFixtureClient::new(&env, &contract_id);

    let result = client.hello(&Symbol::new(&env, "Velo"));

    assert_eq!(result.len(), 2);
    assert_eq!(result.get(0), Some(symbol_short!("Hello")));
    assert_eq!(result.get(1), Some(Symbol::new(&env, "Velo")));
}
