# Docker Testing for create-volo-app

This directory contains Docker-based testing to verify the CLI works in fresh environments without dependency assumptions.

## What This Tests

✅ **Dependency installation** - Clean environment testing  
✅ **Permission handling** - Global/local install fallbacks  
✅ **Prerequisites logic** - Database choice affects CLI tools  
✅ **Git configuration** - Automatic identity setup  
✅ **Cross-platform compatibility** - Linux environment testing  

❌ **Service authentication** - Requires browser/interactive auth  
❌ **Full deployments** - Needs real API keys and services  
❌ **End-to-end workflows** - Limited by Docker environment  

## Quick Start

### Windows:
```cmd
./test/docker/test-docker.bat
```

### macOS/Linux:
```bash
./test/docker/test-docker.sh
```

## Manual Testing

**Important:** Run these commands from the repository root, not from `test/docker/`

```bash
# Build image (from repository root)
docker build -f test/docker/Dockerfile -t create-volo-app-test .

# Run basic tests
docker run --rm create-volo-app-test

# Interactive testing
docker run --rm -it create-volo-app-test /bin/bash
```

## Test Different Database Paths

Inside the container:

```bash
create-volo-app sample-test --verbose

```

## Expected Results

- ✅ All CLI tools install correctly based on database choice
- ✅ Permission issues handled gracefully  
- ✅ Git identity configured automatically
- ✅ Template cloning and basic setup works
- ❌ Service authentication fails (expected in Docker)

## Troubleshooting

**Build fails:** Ensure you're running from the repository root, not from `test/docker/`

**Permission errors:** Should auto-fallback to local installation

**Git errors:** Should auto-configure identity

**Network issues:** Ensure Docker has internet access

## Integration with CI/CD

This Docker setup is perfect for:
- Automated testing of dependency logic
- Regression testing for installation flows  
- Cross-platform compatibility verification
- Clean environment validation

For full end-to-end testing, use local development with real services. 